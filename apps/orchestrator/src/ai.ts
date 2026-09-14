import OpenAI from 'openai';

import {
  AiDirectionSet,
  AiPatchPlan,
  AiRecommendationSet,
  AiScreenSpecDraft,
  ScreenSpec,
  findSpecIntegrityIssues,
  formatIssuesForRepair,
  toStrictJsonSchema,
  type CanvasDesignPreferences,
  type CanvasDoc,
  type Measurement,
  type ScreenSpec as ScreenSpecType,
  type VariantManifest,
} from '@canvascraft/schema';
import { ZodError } from 'zod';

import type { IntegrationCredentials } from './config.js';

const SCREEN_SPEC_SCHEMA = toStrictJsonSchema(AiScreenSpecDraft);
const DIRECTION_SET_SCHEMA = toStrictJsonSchema(AiDirectionSet);
const RECOMMENDATION_SET_SCHEMA = toStrictJsonSchema(AiRecommendationSet);
const PATCH_PLAN_SCHEMA = toStrictJsonSchema(AiPatchPlan);
/**
 * Region ceiling for the live generators.
 *
 * Both the direction and the recommendation prompt embed one selection block
 * per region alongside the whole Screen Spec, so cost and latency grow with the
 * region count. Past this the run keeps its deterministic output and says so,
 * which is better than a slow request that gets truncated.
 */
const MAX_DIRECTION_SELECTION_OPTIONS = 20;

/**
 * Which model a call is entitled to.
 *
 * `textModel` was configured from the first commit and never once referenced:
 * every call went to `visionModel`, including the two that have no image to
 * look at. Direction proposal and recommendation review reason over JSON — a
 * Screen Spec, a manifest, a measurement array — so the vision tier bought
 * nothing and was billed three times per run for recommendations alone.
 *
 * Spec interpretation is the only call that can carry an image, and even it
 * only sometimes does: the web client posts `canvasImage: null` and lets the
 * deterministic pre-pass describe the geometry instead. Choosing per call
 * rather than per function means the vision tier is paid for exactly when
 * there are pixels to read.
 */
function modelFor(
  credentials: NonNullable<IntegrationCredentials['ai']>,
  needsVision: boolean,
): string {
  return needsVision ? credentials.visionModel : credentials.textModel;
}

/** True when the value is a data URL an image model could actually read. */
function hasImage(canvasImage: string | null): boolean {
  return typeof canvasImage === 'string' && canvasImage.startsWith('data:image/');
}

/**
 * What kind of page the model is designing.
 *
 * Stated as a brief rather than as an enum value, because "marketing" tells a
 * model nothing and "a landing page that has to earn a click in one screen"
 * tells it what to reach for. Without this the model produced the same
 * centred-card dashboard whatever the user drew, which is the failure the
 * archetype concept exists to end.
 */
const ARCHETYPE_BRIEFS: Record<CanvasDesignPreferences['archetype'], string> = {
  marketing:
    'This is a LANDING PAGE. It has one screen to earn attention. Reach for oversized display type, a moving gradient or aurora ground, full-bleed sections, glass or gradient panels, and scroll-driven reveals. Vertical rhythm should be deliberate, not cavernous: the space between two sections is a beat, roughly the padding inside a hero — never an empty 100px+ band that makes the reader scroll past nothing. Prefer "regular" density; reserve "roomy" for a page with three or fewer sections. A landing page that is all whitespace reads as unfinished, not premium.',
  application:
    'This is a PRODUCT SURFACE — a dashboard or tool someone uses for hours. Reach for a bento arrangement of panels with real elevation, dense but legible data, sticky table headers, restrained spring feedback on controls, and a quiet ground. Use "compact" or "regular" density; "roomy" wastes a working surface. Nothing should cycle or re-animate on its own; charm that repeats becomes obstruction.',
  portfolio:
    'This is EDITORIAL WORK — a portfolio or agency site where the media is the subject. Reach for large framed media, parallax between foreground and ground, a grain texture, an asymmetric measure, and chrome that gets out of the way. Type should carry more of the design than colour does. Air between sections is fine here, but it should frame the media, not sit empty.',
  'ai-native':
    'This is an AI PRODUCT. Reach for an aurora ground, glass panels, a narrow reading measure, prompt-shaped inputs, and primitives that show the system thinking — streaming text, staged progress, shimmer on pending content. Motion should suggest computation in progress rather than decoration. Keep the reading column tight and the rhythm even; a conversation surface with big empty gaps between turns reads as broken, not calm.',
};

/**
 * The bar every direction is measured against — the "would a designer retouch
 * this?" checklist, stated so the model designs away from the failures rather
 * than only satisfying the schema. Sourced from current (2026) UI-craft
 * guidance on AI-generated interfaces (see docs/adr/0009).
 */
const DIRECTION_ACCEPTANCE_BAR = [
  'A reviewer will retouch a direction that has any of these, so design them out:',
  '- an empty vertical band taller than a section is wide — pick a density and shell rhythm that keep sections a beat apart, not a scroll apart;',
  '- a backdrop and surface that fight (glass on flat) or that read identical across all three directions;',
  '- a palette where body text or the primary action label is under 4.5:1 on its own ground;',
  '- three directions that differ only in hue — each must make a different argument about the product;',
  '- a region left on the neutral fallback when a richer gate-approved pattern was available for its role;',
  '- motion language that does not match the archetype (a landing page that refuses to move, a dashboard that keeps moving);',
  '- a direction so safe it could belong to any product in the category — commit to the argument in `rationale` everywhere a reader would notice it, not just in the name;',
  '- a header or nav that spans the full page width (the template always renders it edge-to-edge) but is styled as if it were still a boxed panel — thin, centred, or under-filled content in a bar that wide reads as a mistake, not restraint.',
].join('\n');

export interface AiInterpretationResult {
  spec: ScreenSpecType;
  repaired: boolean;
}

export interface AiDirectionResult<T> {
  value: T;
  repaired: boolean;
  contrastSummary: string;
}

class DirectionProposalError extends Error {
  constructor(
    message: string,
    readonly candidate: string,
  ) {
    super(message);
    this.name = 'DirectionProposalError';
  }
}

function repairDetail(error: unknown): string {
  if (error instanceof ZodError) return formatIssuesForRepair(error);
  return error instanceof Error ? error.message : 'The prior response could not be validated.';
}

function directionRepairDetail(error: unknown, candidate: string): string {
  return [
    repairDetail(error),
    'Previous candidate JSON follows. Return a complete replacement, not a patch.',
    candidate.slice(0, 16_000),
  ].join('\n\n');
}

function promptFor(
  canvas: CanvasDoc,
  deterministicSpec: ScreenSpecType,
  repairBrief: string | null,
): string {
  return [
    'You interpret a browser wireframe for CanvasCraft.',
    'Return only the requested JSON object. Do not add product wiring, authentication, APIs, network calls, or database behavior.',
    'The supplied deterministic Screen Spec is the structural guardrail. Preserve its region count, region ids, source element ids, and state ids.',
    'Layout comes from what was drawn, not from you: each region\'s layout region, order, nesting, and state visibility are fixed, and every interaction must name a sourceArrowId that already exists on the canvas. Proposals that change those are discarded.',
    'You may improve names, roles, purpose, audience, content shapes, interaction wording, fixtures, responsive grouping, and material ambiguities only when grounded in the canvas notes and labels.',
    'A drawn label is a placeholder for what the element is, not final copy: a navbar labelled "Brandmark" or a button labelled "CTA" is telling you its role, not naming your product. Invent a concrete, plausible name and copy grounded in the canvas intent/audience/notes — never emit a literal placeholder-sounding label as the shipped brand name, nav link, or button text.',
    'Fixture records are distinct content items to display side by side (different products, different nav links, different proof points) — never encode a region\'s own UI state (e.g. "default", "selected", "hover") as a fixture record or field value. States belong only in the states/interactions you were given; a region that toggles between states still gets exactly one set of fixture content, valid across all of them. If a region\'s content shape calls for a list (e.g. nav-items), give every record genuinely distinct content, not repeats of the same title.',
    'Every branch will receive this one shared product contract, so do not describe visual style, colors, typefaces, radius, density, or animation treatment.',
    `Canvas document:\n${JSON.stringify(canvas)}`,
    `Deterministic guardrail:\n${JSON.stringify(deterministicSpec)}`,
    repairBrief ? `Repair the previous proposal. Resolve these validation errors:\n${repairBrief}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function fixtureRecords(
  draft: typeof AiScreenSpecDraft._output,
  regionIds: Set<string>,
): ScreenSpecType['fixtures'] {
  return draft.fixtures.flatMap((fixture) => {
    if (!regionIds.has(fixture.regionId)) return [];
    return [
      {
        regionId: fixture.regionId,
        records: fixture.records.map((record) =>
          Object.fromEntries(record.fields.map((field) => [field.key, field.value])),
        ),
      },
    ];
  });
}

/**
 * Folds an AI draft onto the deterministic spec.
 *
 * Exported for tests: this is where the boundary between "the model may enrich
 * this" and "the canvas decides this" is actually enforced, so it is worth
 * asserting on directly rather than only through a mocked transport.
 */
export function mergeDraft(
  canvas: CanvasDoc,
  deterministicSpec: ScreenSpecType,
  draft: typeof AiScreenSpecDraft._output,
): ScreenSpecType {
  const validSourceIds = new Set(canvas.elements.map((element) => element.id));
  const draftBySource = new Map(
    draft.regions
      .filter((region) => region.sourceElementId === null || validSourceIds.has(region.sourceElementId))
      .map((region) => [region.sourceElementId, region]),
  );
  const regionIds = new Set(deterministicSpec.regions.map((region) => region.id));

  // Structure is the deterministic compiler's alone. `region`, `order`,
  // `bounds`, `children`, and `visibleInStates` are all derived from what was
  // actually drawn, so the model may only enrich naming, meaning, and content.
  const regions = deterministicSpec.regions.map((region) => {
    const proposed = draftBySource.get(region.sourceElementId);
    if (!proposed) return region;
    return {
      ...region,
      role: proposed.role,
      label: proposed.label,
      purpose: proposed.purpose,
      contentShape: proposed.contentShape,
    };
  });

  // One interaction per drawn arrow, always. A proposal is only usable when it
  // names an arrow that is genuinely on the canvas and connects two real
  // regions; anything else keeps the deterministic interaction for that slot, so
  // the model can reword a drawn flow but never invent or delete one.
  const arrowIds = new Set(canvas.arrows.map((arrow) => arrow.id));
  const proposedByArrow = new Map(
    draft.interactions
      .filter(
        (interaction) =>
          interaction.sourceArrowId !== null &&
          arrowIds.has(interaction.sourceArrowId) &&
          regionIds.has(interaction.fromRegion) &&
          regionIds.has(interaction.toRegion) &&
          interaction.fromRegion !== interaction.toRegion,
      )
      .map((interaction) => [interaction.sourceArrowId, interaction]),
  );
  const interactions = deterministicSpec.interactions.map((interaction) => {
    const proposed = proposedByArrow.get(interaction.sourceArrowId);
    if (!proposed) return interaction;
    return {
      ...interaction,
      description: proposed.description,
      auditionable: proposed.auditionable,
    };
  });
  const proposedStates = new Map(draft.states.map((state) => [state.id, state]));
  const states = deterministicSpec.states.map((state) => {
    const proposed = proposedStates.get(state.id);
    if (!proposed) return state;
    return {
      ...state,
      label: proposed.label,
      description: proposed.description,
      hiddenRegions: proposed.hiddenRegions.filter((id) => regionIds.has(id)),
      placeholderRegions: proposed.placeholderRegions.filter((id) => regionIds.has(id)),
    };
  });
  const ambiguities = draft.ambiguities.flatMap((ambiguity) => {
    const optionIds = new Set(ambiguity.options.map((option) => option.id));
    if (ambiguity.options.length < 2 || !optionIds.has(ambiguity.defaultOptionId)) return [];
    return [{ ...ambiguity, resolvedOptionId: null }];
  });
  const spec = ScreenSpec.parse({
    ...deterministicSpec,
    name: draft.name,
    intent: draft.intent,
    audience: draft.audience,
    regions,
    interactions,
    states,
    fixtures: fixtureRecords(draft, regionIds),
    ambiguities,
    responsive: {
      ...deterministicSpec.responsive,
      stacksBelowNarrow: draft.stacksBelowNarrow.filter((id) => regionIds.has(id)),
      collapsesBelowNarrow: draft.collapsesBelowNarrow.filter((id) => regionIds.has(id)),
    },
  });
  const issues = findSpecIntegrityIssues(spec);
  if (issues.length > 0) throw new Error(issues.join(' '));
  return spec;
}

async function requestDraft(
  client: OpenAI,
  model: string,
  canvas: CanvasDoc,
  deterministicSpec: ScreenSpecType,
  repairBrief: string | null,
  canvasImage: string | null,
): Promise<typeof AiScreenSpecDraft._output> {
  const content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail: 'auto' }
  > = [{ type: 'input_text', text: promptFor(canvas, deterministicSpec, repairBrief) }];
  if (canvasImage?.startsWith('data:image/')) {
    content.push({ type: 'input_image', image_url: canvasImage, detail: 'auto' });
  }
  const response = await client.responses.create({
    model,
    input: [{ role: 'user', content }],
    text: {
      format: {
        type: 'json_schema',
        name: 'canvascraft_screen_spec_draft',
        description: 'A validated shared product contract draft for one wireframe.',
        strict: true,
        schema: SCREEN_SPEC_SCHEMA,
      },
    },
    max_output_tokens: 8_000,
    store: false,
  });
  if (response.status === 'incomplete') {
    throw new Error(`AI response was incomplete: ${response.incomplete_details?.reason ?? 'unknown reason'}.`);
  }
  if (!response.output_text) throw new Error('AI response did not contain structured output.');
  return AiScreenSpecDraft.parse(JSON.parse(response.output_text));
}

function directionPrompt(
  spec: ScreenSpecType,
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>,
  designPreferences: CanvasDesignPreferences,
  repairBrief: string | null,
): string {
  return [
    "You are CanvasCraft's senior design director. Produce exactly three deliberately different but equally usable Variant Manifest directions.",
    'Return only the requested JSON object. Do not alter product structure, regions, fixtures, content, interactions, states, accessibility rules, or responsive breakpoints.',
    'You may vary only palette, backdrop, typography, density, surface treatment, control treatment, motion language and emphasis, and the approved pattern selected for each existing region.',
    ARCHETYPE_BRIEFS[designPreferences.archetype],
    `The user has locked four axes in the canvas toolbar and they are applied after you: page archetype, display font, body font, and button shape. Their choices are ${JSON.stringify(designPreferences)}. Set those fields to match; anything you vary on a locked axis is discarded.`,
    // The failure this replaces: the toolbar used to overwrite motion wholesale,
    // so every direction shipped identical timings and the model had no reason
    // to think about movement at all. Language and emphasis now survive, and
    // saying so is what makes the model spend effort on them.
    'Motion is NOT locked. The toolbar sets the run\'s tempo through motionPreset — echo the user\'s choice there and never invent timings — but motionLanguage and motionEmphasis are yours and they survive into the built branch. The three directions MUST use three different motionLanguage values. Treat movement as a design argument, not a finish: "reveal" resolves sections as the reader arrives, "cascade" makes a group read as a group, "spring" makes every change push back, "parallax" separates foreground from ground, "cut" refuses to animate at all so nothing delays a read.',
    'The three directions must also differ on backdrop (what sits behind the page) and on form.surface (what panels are made of). A glass surface needs a backdrop worth blurring — pair "glass" with "aurora", "wash", or "spotlight", never with "flat".',
    'Every direction must use a unique name and a distinct design argument. Two directions that differ only in hue are a failure: a reader should be able to say what each one believes about the product.',
    'Keep all type stacks available in a normal browser fallback chain. Body text must clear 4.5:1 against its background, and the label on the primary action must clear 4.5:1 against the accent.',
    DIRECTION_ACCEPTANCE_BAR,
    'The variants array must contain exactly three complete objects. Before responding, count the array and verify its length is three.',
    'For every region, choose exactly one recordId from its listed approved options. Do not invent ids and do not omit a region.',
    `Shared Screen Spec:\n${JSON.stringify(spec)}`,
    `Gate-approved pattern options by region:\n${JSON.stringify(selectionOptions)}`,
    repairBrief ? `Repair the previous proposal. Resolve these validation errors:\n${repairBrief}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The revise pass: same rules as {@link directionPrompt}, but the model is
 * handed the three manifests it already produced plus the layout issues each
 * one tripped, and asked to change only what clears them. This is the
 * "build -> critique -> fix -> re-check" loop from current UI-craft guidance
 * (see docs/adr/0009): the issues are all manifest-level — a region on the
 * neutral fallback, a roomy density on a working surface, glass over a flat
 * ground — so every one of them is fixable here without touching a component.
 */
function reviseDirectionPrompt(args: {
  spec: ScreenSpecType;
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
  designPreferences: CanvasDesignPreferences;
  current: VariantManifest[];
  defects: Array<{ branchName: string; issues: string[] }>;
}): string {
  return [
    "You are CanvasCraft's senior design director revising three directions you already proposed.",
    'Return only the requested JSON object: a complete replacement Variant Manifest set of exactly three directions, not a patch.',
    'Do not alter product structure, regions, fixtures, content, interactions, states, accessibility rules, or responsive breakpoints. You may vary only palette, backdrop, typography, density, surface treatment, control treatment, motion language and emphasis, and the approved pattern selected for each existing region.',
    ARCHETYPE_BRIEFS[args.designPreferences.archetype],
    `The user has locked these axes and they are applied after you: ${JSON.stringify(args.designPreferences)}. Set those fields to match; anything you vary on a locked axis is discarded.`,
    'Change only what is needed to clear the listed issues for each branch. Keep every direction\'s name, its design argument, and every value not implicated by an issue exactly as it is — a revision that rewrites an untouched direction is a failure.',
    'The three directions must still be genuinely different from each other on backdrop, form.surface, and motionLanguage, and each must still clear 4.5:1 on body text and on the primary action label.',
    DIRECTION_ACCEPTANCE_BAR,
    `Shared Screen Spec:\n${JSON.stringify(args.spec)}`,
    `Gate-approved pattern options by region:\n${JSON.stringify(args.selectionOptions)}`,
    `The three directions you produced:\n${JSON.stringify(
      args.current.map((manifest) => ({
        name: manifest.name,
        rationale: manifest.rationale,
        palette: manifest.palette,
        typography: manifest.typography,
        form: manifest.form,
        controls: manifest.controls,
        motion: manifest.motion,
        selections: manifest.selections,
      })),
    )}`,
    `Issues to clear, by direction:\n${args.defects
      .map((entry) => `${entry.branchName}:\n- ${entry.issues.join('\n- ')}`)
      .join('\n\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function requestRevisedDirectionSet(
  client: OpenAI,
  model: string,
  args: {
    spec: ScreenSpecType;
    selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
    designPreferences: CanvasDesignPreferences;
    current: VariantManifest[];
    defects: Array<{ branchName: string; issues: string[] }>;
  },
): Promise<{ directionSet: typeof AiDirectionSet._output; raw: string }> {
  const response = await client.responses.create({
    model,
    input: reviseDirectionPrompt(args),
    text: {
      format: {
        type: 'json_schema',
        name: 'canvascraft_direction_set',
        description: 'Three revised visual treatment directions for one locked Screen Spec.',
        strict: true,
        schema: DIRECTION_SET_SCHEMA,
      },
    },
    max_output_tokens: 8_000,
    store: false,
  });
  if (response.status === 'incomplete') {
    throw new Error(`AI response was incomplete: ${response.incomplete_details?.reason ?? 'unknown reason'}.`);
  }
  if (!response.output_text) throw new Error('AI response did not contain structured output.');
  try {
    return {
      directionSet: AiDirectionSet.parse(JSON.parse(response.output_text)),
      raw: response.output_text,
    };
  } catch (error) {
    throw new DirectionProposalError(repairDetail(error), response.output_text);
  }
}

async function requestDirectionSet(
  client: OpenAI,
  model: string,
  spec: ScreenSpecType,
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>,
  designPreferences: CanvasDesignPreferences,
  repairBrief: string | null,
): Promise<{ directionSet: typeof AiDirectionSet._output; raw: string }> {
  const response = await client.responses.create({
    model,
    input: directionPrompt(spec, selectionOptions, designPreferences, repairBrief),
    text: {
      format: {
        type: 'json_schema',
        name: 'canvascraft_direction_set',
        description: 'Three validated visual treatment directions for one locked Screen Spec.',
        strict: true,
        schema: DIRECTION_SET_SCHEMA,
      },
    },
    max_output_tokens: 8_000,
    store: false,
  });
  if (response.status === 'incomplete') {
    throw new Error(`AI response was incomplete: ${response.incomplete_details?.reason ?? 'unknown reason'}.`);
  }
  if (!response.output_text) throw new Error('AI response did not contain structured output.');
  try {
    return {
      directionSet: AiDirectionSet.parse(JSON.parse(response.output_text)),
      raw: response.output_text,
    };
  } catch (error) {
    throw new DirectionProposalError(repairDetail(error), response.output_text);
  }
}

export async function interpretScreenSpec(args: {
  credentials: NonNullable<IntegrationCredentials['ai']>;
  canvas: CanvasDoc;
  canvasImage: string | null;
  deterministicSpec: ScreenSpecType;
}): Promise<AiInterpretationResult> {
  const client = new OpenAI({
    apiKey: args.credentials.apiKey,
    baseURL: args.credentials.baseUrl,
    maxRetries: 1,
    timeout: 45_000,
  });
  const model = modelFor(args.credentials, hasImage(args.canvasImage));
  try {
    const draft = await requestDraft(
      client,
      model,
      args.canvas,
      args.deterministicSpec,
      null,
      args.canvasImage,
    );
    return { spec: mergeDraft(args.canvas, args.deterministicSpec, draft), repaired: false };
  } catch (error) {
    const repairBrief = repairDetail(error);
    const draft = await requestDraft(
      client,
      model,
      args.canvas,
      args.deterministicSpec,
      repairBrief,
      args.canvasImage,
    );
    return { spec: mergeDraft(args.canvas, args.deterministicSpec, draft), repaired: true };
  }
}

function recommendationPrompt(args: {
  spec: ScreenSpecType;
  manifest: VariantManifest;
  measurements: Measurement[];
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
  repairBrief: string | null;
}): string {
  return [
    "You are CanvasCraft's design director reviewing one generated branch.",
    'Return only the requested JSON object. Propose between three and six recommendations for this branch alone.',
    'You may change palette (including backdrop: flat, wash, aurora, grain, spotlight), typography, density, surface treatment (solid, glass, gradient, outline), control treatment, motion (including its language: reveal, cascade, spring, parallax, cut), and the pattern selected for a region. You cannot change the Screen Spec: no layout, region, content, interaction, state, or copy changes.',
    'A recommendation that only nudges a value the branch already clears is not useful even when it is technically true. Prefer a change a screenshot would show: a bolder backdrop, a richer gate-approved pattern for a region still on the neutral fallback, a surface or motion-language change that matches this manifest\'s own archetype.',
    'Ground every recommendation in the supplied measurements or in a concrete property of this manifest. Put the number you are reasoning from in the evidence field. Never state a measurement that is not in the supplied data.',
    'Severity is "blocker" only for a measurement that fails its floor, "improvement" for a real usability cost, and "polish" for taste. Do not inflate severity.',
    'Every recommendation must carry a delta that actually changes at least one value. Set every field you are not changing to null.',
    'For a selection swap, choose only from the gate-approved options listed for that region.',
    `Shared Screen Spec:\n${JSON.stringify(args.spec)}`,
    `This branch's Variant Manifest:\n${JSON.stringify(args.manifest)}`,
    `Measured against the run's locked accessibility floors:\n${JSON.stringify(args.measurements)}`,
    `Gate-approved pattern options by region:\n${JSON.stringify(args.selectionOptions)}`,
    args.repairBrief ? `Repair the previous proposal. Resolve these validation errors:\n${args.repairBrief}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function requestRecommendationSet(
  client: OpenAI,
  model: string,
  args: {
    spec: ScreenSpecType;
    manifest: VariantManifest;
    measurements: Measurement[];
    selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
    repairBrief: string | null;
  },
): Promise<{ set: typeof AiRecommendationSet._output; raw: string }> {
  const response = await client.responses.create({
    model,
    input: recommendationPrompt(args),
    text: {
      format: {
        type: 'json_schema',
        name: 'canvascraft_recommendation_set',
        description: 'Grounded design recommendations for one generated branch.',
        strict: true,
        schema: RECOMMENDATION_SET_SCHEMA,
      },
    },
    max_output_tokens: 6_000,
    store: false,
  });
  if (response.status === 'incomplete') {
    throw new Error(`AI response was incomplete: ${response.incomplete_details?.reason ?? 'unknown reason'}.`);
  }
  if (!response.output_text) throw new Error('AI response did not contain structured output.');
  try {
    return { set: AiRecommendationSet.parse(JSON.parse(response.output_text)), raw: response.output_text };
  } catch (error) {
    throw new DirectionProposalError(repairDetail(error), response.output_text);
  }
}

/**
 * Design Director recommendations for one branch.
 *
 * Structurally identical to {@link proposeDirections}: strict structured output
 * with one repair attempt, and the caller validates the result before it is
 * trusted. The caller is expected to keep its own measured findings regardless
 * of what comes back, so a plausible-sounding but ungrounded proposal cannot
 * displace a real failure.
 */
export async function proposeRecommendations<T>(args: {
  credentials: NonNullable<IntegrationCredentials['ai']>;
  spec: ScreenSpecType;
  manifest: VariantManifest;
  measurements: Measurement[];
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
  validate: (set: typeof AiRecommendationSet._output) => T;
}): Promise<{ value: T; repaired: boolean }> {
  if (args.selectionOptions.length > MAX_DIRECTION_SELECTION_OPTIONS) {
    throw new Error(
      `The canvas has ${args.selectionOptions.length} regions, which exceeds the live design review limit of ${MAX_DIRECTION_SELECTION_OPTIONS}.`,
    );
  }
  const client = new OpenAI({
    apiKey: args.credentials.apiKey,
    baseURL: args.credentials.baseUrl,
    maxRetries: 1,
    timeout: 45_000,
  });
  const request = {
    spec: args.spec,
    manifest: args.manifest,
    measurements: args.measurements,
    selectionOptions: args.selectionOptions,
  };

  let initial: { set: typeof AiRecommendationSet._output; raw: string };
  try {
    initial = await requestRecommendationSet(client, modelFor(args.credentials, false), {
      ...request,
      repairBrief: null,
    });
  } catch (error) {
    if (!(error instanceof DirectionProposalError)) throw error;
    const repaired = await requestRecommendationSet(client, modelFor(args.credentials, false), {
      ...request,
      repairBrief: directionRepairDetail(error, error.candidate),
    });
    return { value: args.validate(repaired.set), repaired: true };
  }
  try {
    return { value: args.validate(initial.set), repaired: false };
  } catch (error) {
    const repaired = await requestRecommendationSet(client, modelFor(args.credentials, false), {
      ...request,
      repairBrief: directionRepairDetail(error, initial.raw),
    });
    return { value: args.validate(repaired.set), repaired: true };
  }
}

function patchPrompt(args: {
  spec: ScreenSpecType;
  manifest: VariantManifest;
  region: { id: string; label: string; role: string };
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
  request: string;
  repairBrief: string | null;
}): string {
  return [
    "You are CanvasCraft's design director answering one freeform request about a generated branch.",
    'Return only the requested JSON object.',
    `The user typed the request with one region selected: ${JSON.stringify(args.region)}. Set regionId to exactly that id.`,
    'Work out what the request actually asks for, then express it as a manifest delta that genuinely satisfies it. Do not reach for a pattern swap by default; a swap is the right lever only when the request is about what component sits in that region.',
    'The selected region scopes the REQUEST, not the delta. When the honest answer to the request is a branch-wide trait — palette, backdrop, typography, density, surface treatment, control treatment, motion — change that trait. A request that reads as global styling is a normal, expected patch, not a refusal.',
    'Refuse instead of guessing, by writing one sentence into refusalReason, only when: the request needs a Screen Spec change (adding, removing, reordering, resizing, nesting or restructuring regions, changing layout, copy, content, fixtures, interactions or states); or the request is unintelligible; or it asks for something outside what a web UI manifest can express at all (product wiring, data, authentication, deployment).',
    'When you refuse, leave every delta field null and selectionSwaps empty. When you do not refuse, set refusalReason to null and change at least one value — a delta that restates what the manifest already holds is a failure, because the user is told it worked and nothing moves.',
    'Set every field you are not changing to null. For a selection swap, choose only from the gate-approved options listed for that region, and never invent an id.',
    'interpretation is what the user reads back: one plain sentence, at most 300 characters, saying what you changed and why it answers what they asked. Never restate the request verbatim and never describe a change you did not put in the delta.',
    `The user's request:\n${JSON.stringify(args.request)}`,
    `This branch's Variant Manifest:\n${JSON.stringify(args.manifest)}`,
    `Shared Screen Spec (product structure; you cannot change any of it):\n${JSON.stringify(args.spec)}`,
    `Gate-approved pattern options by region:\n${JSON.stringify(args.selectionOptions)}`,
    args.repairBrief ? `Repair the previous proposal. Resolve these validation errors:\n${args.repairBrief}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function requestPatchPlan(
  client: OpenAI,
  model: string,
  args: {
    spec: ScreenSpecType;
    manifest: VariantManifest;
    region: { id: string; label: string; role: string };
    selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
    request: string;
    repairBrief: string | null;
  },
): Promise<{ plan: typeof AiPatchPlan._output; raw: string }> {
  const response = await client.responses.create({
    model,
    input: patchPrompt(args),
    text: {
      format: {
        type: 'json_schema',
        name: 'canvascraft_patch_plan',
        description: 'One interpreted design-chat request resolved into a manifest delta.',
        strict: true,
        schema: PATCH_PLAN_SCHEMA,
      },
    },
    max_output_tokens: 4_000,
    store: false,
  });
  if (response.status === 'incomplete') {
    throw new Error(`AI response was incomplete: ${response.incomplete_details?.reason ?? 'unknown reason'}.`);
  }
  if (!response.output_text) throw new Error('AI response did not contain structured output.');
  try {
    return { plan: AiPatchPlan.parse(JSON.parse(response.output_text)), raw: response.output_text };
  } catch (error) {
    throw new DirectionProposalError(repairDetail(error), response.output_text);
  }
}

/**
 * Interprets one design-chat request against one branch.
 *
 * Structurally identical to {@link proposeRecommendations}: strict structured
 * output with a single repair attempt, and the caller's `validate` decides
 * whether the result is usable. A refusal is a valid plan, not a failure, so
 * `validate` sees it and the repair loop stays reserved for output that does not
 * satisfy the contract.
 */
export async function proposePatch<T>(args: {
  credentials: NonNullable<IntegrationCredentials['ai']>;
  spec: ScreenSpecType;
  manifest: VariantManifest;
  region: { id: string; label: string; role: string };
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
  request: string;
  validate: (plan: typeof AiPatchPlan._output) => T;
}): Promise<{ value: T; repaired: boolean }> {
  if (args.selectionOptions.length > MAX_DIRECTION_SELECTION_OPTIONS) {
    throw new Error(
      `The canvas has ${args.selectionOptions.length} regions, which exceeds the live design chat limit of ${MAX_DIRECTION_SELECTION_OPTIONS}.`,
    );
  }
  const client = new OpenAI({
    apiKey: args.credentials.apiKey,
    baseURL: args.credentials.baseUrl,
    maxRetries: 1,
    timeout: 45_000,
  });
  const request = {
    spec: args.spec,
    manifest: args.manifest,
    region: args.region,
    selectionOptions: args.selectionOptions,
    request: args.request,
  };

  let initial: { plan: typeof AiPatchPlan._output; raw: string };
  try {
    initial = await requestPatchPlan(client, modelFor(args.credentials, false), {
      ...request,
      repairBrief: null,
    });
  } catch (error) {
    if (!(error instanceof DirectionProposalError)) throw error;
    const repaired = await requestPatchPlan(client, modelFor(args.credentials, false), {
      ...request,
      repairBrief: directionRepairDetail(error, error.candidate),
    });
    return { value: args.validate(repaired.plan), repaired: true };
  }
  try {
    return { value: args.validate(initial.plan), repaired: false };
  } catch (error) {
    const repaired = await requestPatchPlan(client, modelFor(args.credentials, false), {
      ...request,
      repairBrief: directionRepairDetail(error, initial.raw),
    });
    return { value: args.validate(repaired.plan), repaired: true };
  }
}

export async function proposeDirections<T>(args: {
  credentials: NonNullable<IntegrationCredentials['ai']>;
  spec: ScreenSpecType;
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
  designPreferences: CanvasDesignPreferences;
  validate: (directionSet: typeof AiDirectionSet._output) => T;
}): Promise<AiDirectionResult<T>> {
  if (args.selectionOptions.length > MAX_DIRECTION_SELECTION_OPTIONS) {
    throw new Error(
      `The canvas has ${args.selectionOptions.length} regions, which exceeds the live direction generator limit of ${MAX_DIRECTION_SELECTION_OPTIONS}.`,
    );
  }
  const client = new OpenAI({
    apiKey: args.credentials.apiKey,
    baseURL: args.credentials.baseUrl,
    maxRetries: 1,
    timeout: 45_000,
  });
  let initial: { directionSet: typeof AiDirectionSet._output; raw: string };
  try {
    initial = await requestDirectionSet(
      client,
      modelFor(args.credentials, false),
      args.spec,
      args.selectionOptions,
      args.designPreferences,
      null,
    );
  } catch (error) {
    if (!(error instanceof DirectionProposalError)) throw error;
    const repaired = await requestDirectionSet(
      client,
      modelFor(args.credentials, false),
      args.spec,
      args.selectionOptions,
      args.designPreferences,
      directionRepairDetail(error, error.candidate),
    );
    return {
      value: args.validate(repaired.directionSet),
      repaired: true,
      contrastSummary: repaired.directionSet.contrastSummary,
    };
  }
  try {
    return {
      value: args.validate(initial.directionSet),
      repaired: false,
      contrastSummary: initial.directionSet.contrastSummary,
    };
  } catch (error) {
    const repaired = await requestDirectionSet(
      client,
      modelFor(args.credentials, false),
      args.spec,
      args.selectionOptions,
      args.designPreferences,
      directionRepairDetail(error, initial.raw),
    );
    return {
      value: args.validate(repaired.directionSet),
      repaired: true,
      contrastSummary: repaired.directionSet.contrastSummary,
    };
  }
}

/**
 * One revision round of the layout-audit critic loop.
 *
 * Structurally the same as {@link proposeDirections}: strict structured output
 * with a single validation-repair attempt, and the caller's `validate` (the
 * compiler's `buildDirectionsFromAi`) is the only thing that decides whether
 * the result is usable. The caller keeps its own audit findings regardless, so
 * a revision that only claims to have fixed something cannot slip through.
 */
export async function reviseDirections<T>(args: {
  credentials: NonNullable<IntegrationCredentials['ai']>;
  spec: ScreenSpecType;
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
  designPreferences: CanvasDesignPreferences;
  current: VariantManifest[];
  defects: Array<{ branchName: string; issues: string[] }>;
  validate: (directionSet: typeof AiDirectionSet._output) => T;
}): Promise<AiDirectionResult<T>> {
  if (args.selectionOptions.length > MAX_DIRECTION_SELECTION_OPTIONS) {
    throw new Error(
      `The canvas has ${args.selectionOptions.length} regions, which exceeds the live direction generator limit of ${MAX_DIRECTION_SELECTION_OPTIONS}.`,
    );
  }
  const client = new OpenAI({
    apiKey: args.credentials.apiKey,
    baseURL: args.credentials.baseUrl,
    maxRetries: 1,
    timeout: 45_000,
  });
  const request = {
    spec: args.spec,
    selectionOptions: args.selectionOptions,
    designPreferences: args.designPreferences,
    current: args.current,
    defects: args.defects,
  };

  let initial: { directionSet: typeof AiDirectionSet._output; raw: string };
  try {
    initial = await requestRevisedDirectionSet(client, modelFor(args.credentials, false), request);
  } catch (error) {
    if (!(error instanceof DirectionProposalError)) throw error;
    const repaired = await requestDirectionSet(
      client,
      modelFor(args.credentials, false),
      args.spec,
      args.selectionOptions,
      args.designPreferences,
      directionRepairDetail(error, error.candidate),
    );
    return {
      value: args.validate(repaired.directionSet),
      repaired: true,
      contrastSummary: repaired.directionSet.contrastSummary,
    };
  }
  try {
    return {
      value: args.validate(initial.directionSet),
      repaired: false,
      contrastSummary: initial.directionSet.contrastSummary,
    };
  } catch (error) {
    const repaired = await requestDirectionSet(
      client,
      modelFor(args.credentials, false),
      args.spec,
      args.selectionOptions,
      args.designPreferences,
      directionRepairDetail(error, initial.raw),
    );
    return {
      value: args.validate(repaired.directionSet),
      repaired: true,
      contrastSummary: repaired.directionSet.contrastSummary,
    };
  }
}
