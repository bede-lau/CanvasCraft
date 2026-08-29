import OpenAI from 'openai';

import {
  AiDirectionSet,
  AiScreenSpecDraft,
  ScreenSpec,
  findSpecIntegrityIssues,
  formatIssuesForRepair,
  toStrictJsonSchema,
  type CanvasDoc,
  type ScreenSpec as ScreenSpecType,
} from '@canvascraft/schema';
import { ZodError } from 'zod';

import type { IntegrationCredentials } from './config.js';

const SCREEN_SPEC_SCHEMA = toStrictJsonSchema(AiScreenSpecDraft);
const DIRECTION_SET_SCHEMA = toStrictJsonSchema(AiDirectionSet);
const MAX_DIRECTION_SELECTION_OPTIONS = 20;

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
    'You may improve names, purpose, audience, content shapes, interactions, fixtures, responsive grouping, and material ambiguities only when grounded in the canvas notes and labels.',
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

function mergeDraft(
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

  const regions = deterministicSpec.regions.map((region) => {
    const proposed = draftBySource.get(region.sourceElementId);
    if (!proposed) return region;
    return {
      ...region,
      role: proposed.role,
      region: proposed.region,
      label: proposed.label,
      purpose: proposed.purpose,
      children: proposed.children.filter((id) => id !== region.id && regionIds.has(id)),
      visibleInStates: proposed.visibleInStates,
      contentShape: proposed.contentShape,
    };
  });

  const interactions = draft.interactions.filter(
    (interaction) =>
      regionIds.has(interaction.fromRegion) &&
      regionIds.has(interaction.toRegion) &&
      interaction.fromRegion !== interaction.toRegion,
  );
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
    interactions: interactions.length > 0 ? interactions : deterministicSpec.interactions,
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
  repairBrief: string | null,
): string {
  return [
    "You are CanvasCraft's senior design director. Produce exactly three deliberately different but equally usable Variant Manifest directions.",
    'Return only the requested JSON object. Do not alter product structure, regions, fixtures, content, interactions, states, accessibility rules, or responsive breakpoints.',
    'You may vary only palette, typography, density, control treatment, motion preset, and the approved pattern selected for each existing region.',
    'Every direction must use a unique name and a distinct design argument. Keep all type stacks available in a normal browser fallback chain and preserve readable contrast and visible focus.',
    'The motion preset is a semantic token. Never invent motion timings; the runtime maps the selected preset to its locked accessible definition.',
    'The variants array must contain exactly three complete objects. Before responding, count the array and verify its length is three.',
    'For every region, choose exactly one recordId from its listed approved options. Do not invent ids and do not omit a region.',
    `Shared Screen Spec:\n${JSON.stringify(spec)}`,
    `Gate-approved pattern options by region:\n${JSON.stringify(selectionOptions)}`,
    repairBrief ? `Repair the previous proposal. Resolve these validation errors:\n${repairBrief}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function requestDirectionSet(
  client: OpenAI,
  model: string,
  spec: ScreenSpecType,
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>,
  repairBrief: string | null,
): Promise<{ directionSet: typeof AiDirectionSet._output; raw: string }> {
  const response = await client.responses.create({
    model,
    input: directionPrompt(spec, selectionOptions, repairBrief),
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
  try {
    const draft = await requestDraft(
      client,
      args.credentials.visionModel,
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
      args.credentials.visionModel,
      args.canvas,
      args.deterministicSpec,
      repairBrief,
      args.canvasImage,
    );
    return { spec: mergeDraft(args.canvas, args.deterministicSpec, draft), repaired: true };
  }
}

export async function proposeDirections<T>(args: {
  credentials: NonNullable<IntegrationCredentials['ai']>;
  spec: ScreenSpecType;
  selectionOptions: Array<{ regionId: string; recordIds: string[] }>;
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
      args.credentials.visionModel,
      args.spec,
      args.selectionOptions,
      null,
    );
  } catch (error) {
    if (!(error instanceof DirectionProposalError)) throw error;
    const repaired = await requestDirectionSet(
      client,
      args.credentials.visionModel,
      args.spec,
      args.selectionOptions,
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
      args.credentials.visionModel,
      args.spec,
      args.selectionOptions,
      directionRepairDetail(error, initial.raw),
    );
    return {
      value: args.validate(repaired.directionSet),
      repaired: true,
      contrastSummary: repaired.directionSet.contrastSummary,
    };
  }
}
