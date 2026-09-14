import { EventEmitter } from 'node:events';

import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { ZodError } from 'zod';

import {
  ApplyRecommendationRequest,
  GenerateRequest,
  PatchInstruction,
  PatchRequest,
  Recommendation,
  RemixRequest,
  RunEvent,
  RunRecord,
  SelectChampionRequest,
  findCanvasIntegrityIssues,
  findLayoutRiskIssues,
  findManifestContextIssues,
  findManifestIntegrityIssues,
  measureBranch,
  type AiRecommendationDraft,
  type ManifestPatternContext,
  type ManifestDelta,
  type PatchInstruction as PatchInstructionType,
  type Recommendation as RecommendationType,
  type RunEvent as RunEventType,
  type RunRecord as RunRecordType,
} from '@canvascraft/schema';
import { assessRecord, getRegistryRecord } from '@canvascraft/registry';

import {
  buildCandidates,
  buildDirections,
  buildDirectionsFromAi,
  compileScreenSpec,
  directionSelectionOptions,
  hashSpec,
} from './compiler.js';
import { type IntegrationCredentials, type OrchestratorConfig } from './config.js';
import {
  interpretScreenSpec,
  proposeDirections,
  proposePatch,
  proposeRecommendations,
  reviseDirections,
} from './ai.js';
import { aiDeltaToManifestDelta, deltaChangesManifest, measuredRecommendations } from './director.js';
import { materializeBranch } from './branch-materializer.js';
import { DaytonaBranchManager } from './daytona.js';
import { applyDelta, captureDelta, createRemix, makePatch } from './mutations.js';
import { rankWithOpenAi } from './visual-ranker.js';
import { RunStore } from './store.js';

type MutationRecord =
  | {
      type: 'recommendation-applied';
      recommendationId: string;
      branchId: string;
      revertTo: ManifestDelta;
    }
  | {
      type: 'branch-deleted';
      branchId: string;
      branchName: string;
      deletedAt: string;
    }
  | {
      type: 'patch-applied';
      patch: PatchInstructionType;
    }
  | {
      type: 'patch-deleted';
      patchId: string;
      branchId: string;
      revertTo: ManifestDelta;
    };

type EventInput<T> = T extends unknown ? Omit<T, 'id' | 'runId' | 'at'> : never;

export interface BuildAppOptions {
  config: OrchestratorConfig;
  logger?: boolean;
}

type PublicBranch = Omit<RunRecordType['branches'][number], 'previewToken'>;
type PublicRun = Omit<RunRecordType, 'branches'> & { branches: PublicBranch[] };

function now(): string {
  return new Date().toISOString();
}

/**
 * The registry facts {@link findManifestContextIssues} needs about a selected
 * pattern, resolved by id. Keeps the schema package registry-free while still
 * letting it reject a manifest whose selections fight their context.
 */
function patternContext(recordId: string): ManifestPatternContext | undefined {
  const record = getRegistryRecord(recordId);
  if (!record) return undefined;
  return {
    name: record.name,
    motionIntensity: record.motionIntensity,
    mobileRisk: record.mobileRisk,
    fallbackId: record.fallbackId,
  };
}

function previewProxyPath(branch: RunRecordType['branches'][number]): string {
  return `/runs/${encodeURIComponent(branch.runId)}/branches/${encodeURIComponent(branch.id)}/preview/`;
}

function publicBranch(branch: RunRecordType['branches'][number]): PublicBranch {
  const { previewToken: _previewToken, ...publicValue } = branch;
  const upstreamPreview = branch.previewToken ?? branch.previewUrl;
  return {
    ...publicValue,
    previewUrl: upstreamPreview ? previewProxyPath(branch) : null,
  };
}

function publicRun(run: RunRecordType): PublicRun {
  return { ...run, branches: run.branches.map(publicBranch) };
}

function rebasePreviewHtml(html: string): string {
  return html.replace(/\b(src|href)=(["'])\/(?!\/)/gi, '$1=$2./');
}

function event(runId: string, input: EventInput<RunEventType>): RunEventType {
  return RunEvent.parse({ id: nanoid(), runId, at: now(), ...input });
}

/**
 * Turns one branch's AI proposals into recommendations, discarding anything the
 * measured pass already covers.
 *
 * A measured finding is reproducible from the manifest; an AI one is an
 * argument. When both speak to the same surface the measurement wins, so the
 * model can add insight but never talk over a real accessibility failure.
 */
function adoptAiRecommendations(args: {
  branch: RunRecordType['branches'][number];
  drafts: AiRecommendationDraft[];
  measured: RecommendationType[];
  regionIds: Set<string>;
  createdAt: string;
}): RecommendationType[] {
  const coveredSurfaces = new Set(args.measured.map((entry) => entry.surface));
  const used = new Set<string>();

  return args.drafts.flatMap((draft) => {
    if (coveredSurfaces.has(draft.surface)) return [];
    const delta = aiDeltaToManifestDelta(draft.delta);
    // A recommendation that changes nothing is advice, not a proposal.
    if (!deltaChangesManifest(args.branch.manifest, delta)) return [];
    if (delta.selectionSwaps.some((swap) => !args.regionIds.has(swap.regionId))) return [];
    const id = `${args.branch.id}-ai-${draft.surface}`;
    if (used.has(id)) return [];
    used.add(id);

    return [
      Recommendation.parse({
        id,
        branchId: args.branch.id,
        surface: draft.surface,
        // Only a measurement can prove a blocker, so an AI claim is capped.
        severity: draft.severity === 'blocker' ? 'improvement' : draft.severity,
        title: draft.title.slice(0, 120),
        rationale: draft.rationale.slice(0, 500),
        regionId: draft.regionId && args.regionIds.has(draft.regionId) ? draft.regionId : null,
        delta,
        evidence: draft.evidence.slice(0, 240),
        source: 'ai',
        state: 'proposed',
        createdAt: args.createdAt,
      }),
    ] satisfies RecommendationType[];
  });
}

/**
 * Interprets one design-chat request with the AI, or gives up.
 *
 * `null` means "the heuristic patch is the honest answer here": no credentials
 * reached this far, the run has no spec to reason over, the transport failed, or
 * the model proposed a delta that restates the manifest. A refusal is different
 * — the model understood the request and it cannot be honoured without changing
 * the Screen Spec — so it is thrown as a 422 and never quietly downgraded into a
 * pattern swap the user did not ask for.
 */
async function aiPatchInstruction(args: {
  credentials: NonNullable<IntegrationCredentials['ai']>;
  run: RunRecordType;
  branch: RunRecordType['branches'][number];
  regionId: string;
  request: string;
  id: string;
  createdAt: string;
}): Promise<PatchInstructionType | null> {
  const spec = args.run.spec;
  if (!spec) return null;
  const region = spec.regions.find((entry) => entry.id === args.regionId);
  if (!region) return null;
  const regionIds = new Set(spec.regions.map((entry) => entry.id));
  const selectionOptions = directionSelectionOptions({ spec, candidates: args.run.candidates });
  const approved = new Map(selectionOptions.map((entry) => [entry.regionId, new Set(entry.recordIds)]));

  type PatchPlan =
    | { refusalReason: string }
    | { refusalReason: null; interpretation: string; delta: ManifestDelta };

  let proposed: { value: PatchPlan };
  try {
    proposed = await proposePatch<PatchPlan>({
      credentials: args.credentials,
      spec,
      manifest: args.branch.manifest,
      region: { id: region.id, label: region.label, role: region.role },
      selectionOptions,
      request: args.request,
      validate: (plan) => {
        if (plan.refusalReason) return { refusalReason: plan.refusalReason };
        const delta = aiDeltaToManifestDelta(plan.delta);
        for (const swap of delta.selectionSwaps) {
          if (!regionIds.has(swap.regionId)) {
            throw new Error(`selectionSwaps names region "${swap.regionId}", which this screen does not contain.`);
          }
          if (!approved.get(swap.regionId)?.has(swap.recordId)) {
            throw new Error(
              `Pattern "${swap.recordId}" is not one of the gate-approved options for region "${swap.regionId}".`,
            );
          }
        }
        return { refusalReason: null, interpretation: plan.interpretation, delta };
      },
    });
  } catch {
    return null;
  }

  if (proposed.value.refusalReason !== null) {
    const error = new Error(proposed.value.refusalReason);
    Object.assign(error, { statusCode: 422 });
    throw error;
  }
  const delta = proposed.value.delta;
  if (!deltaChangesManifest(args.branch.manifest, delta)) return null;

  return PatchInstruction.parse({
    id: args.id,
    branchId: args.branch.id,
    regionId: args.regionId,
    request: args.request,
    interpretation: proposed.value.interpretation.slice(0, 400),
    delta,
    revertTo: captureDelta(args.branch.manifest, delta),
    state: 'proposed',
    error: null,
    createdAt: args.createdAt,
  });
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    routerOptions: { ignoreTrailingSlash: true },
  });
  const store = new RunStore(options.config.dataDir);
  const bus = new EventEmitter();
  const locks = new Map<string, Promise<void>>();
  await store.initialise();
  const allowedOrigins = new Set([
    options.config.webOrigin ?? 'http://localhost:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  await app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  });

  const emit = async (entry: RunEventType): Promise<void> => {
    await store.appendEvent(entry);
    bus.emit(entry.runId, entry);
  };

  const withRunLock = async <T>(runId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = locks.get(runId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    locks.set(runId, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (locks.get(runId) === queued) locks.delete(runId);
    }
  };

  const requireRun = async (runId: string): Promise<RunRecordType> => {
    const run = await store.readRun(runId);
    if (!run) {
      const error = new Error(`Run "${runId}" was not found.`);
      Object.assign(error, { statusCode: 404 });
      throw error;
    }
    return run;
  };

  /**
   * Every sandbox id a persisted branch still points at, or `null` if that
   * cannot be established.
   *
   * A preview is only reachable through a branch record, so this is the set of
   * sandboxes that are doing something for somebody. `null` is returned rather
   * than a partial set when any run on disk fails to read: the only consumer
   * stops what is missing from this set, and guessing there would stop a live
   * preview.
   */
  const collectLiveSandboxIds = async (): Promise<Set<string> | null> => {
    const live = new Set<string>();
    for (const id of await store.listRunIds()) {
      let run: RunRecordType | null;
      try {
        run = await store.readRun(id);
      } catch {
        return null;
      }
      if (!run) continue;
      for (const branch of run.branches) {
        if (branch.sandboxId) live.add(branch.sandboxId);
      }
    }
    return live;
  };

  /** Pushes a changed manifest to the live sandbox and returns the rebuilt branch. */
  const syncLiveBranch = async (
    run: RunRecordType,
    branch: RunRecordType['branches'][number],
  ): Promise<RunRecordType['branches'][number]> => {
    if (!run.spec) return branch;
    const files = materializeBranch(run.spec, branch.manifest);
    // Persist the regenerated files regardless of whether a live sandbox
    // exists, so an applied manifest change is never lost to disk — only
    // the sandbox push (and its rebuild) is conditional on having one.
    await store.writeBranchFiles(run.id, branch.id, files);
    if (!options.config.credentials?.daytona || !branch.sandboxId) return branch;
    const manager = new DaytonaBranchManager(options.config.credentials.daytona);
    const logTail = await manager.syncGeneratedModules(branch.sandboxId, files);
    return { ...branch, logTail, updatedAt: now() };
  };

  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'validation_error', issues: error.issues });
    }
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 400;
    const message = error instanceof Error ? error.message : 'Unknown orchestrator error.';
    return reply.status(statusCode).send({ error: message });
  });

  app.get('/health', async () => ({
    status: 'ok',
    mode: 'offline-first',
    persistence: 'append-only',
    integrations: options.config.integrations,
  }));

  app.get('/config', async () => ({
    dataDir: options.config.dataDir,
    branchCount: 3,
    credentialsExposedToBrowser: false,
    integrations: options.config.integrations,
  }));

  const proxyPreview = async (request: FastifyRequest, reply: FastifyReply) => {
    const { runId, branchId, '*': assetPath } = request.params as {
      runId: string;
      branchId: string;
      '*': string | undefined;
    };
    const run = await requireRun(runId);
    const branch = run.branches.find((entry) => entry.id === branchId);
    const upstreamPreview = branch?.previewToken ?? branch?.previewUrl;
    if (!branch || !upstreamPreview || branch.status !== 'serving') {
      return reply.status(404).send({ error: 'Live preview is not available for this branch.' });
    }

    let target: URL;
    try {
      target = new URL(upstreamPreview);
    } catch {
      throw new Error('Stored Daytona preview capability is invalid.');
    }
    if (assetPath) {
      target.pathname = `${target.pathname.replace(/\/+$/, '')}/${assetPath.replace(/^\/+/, '')}`;
    }
    const downstream = new URL(request.raw.url ?? '/', 'http://localhost');
    for (const [key, value] of downstream.searchParams) target.searchParams.append(key, value);

    let upstream: Response;
    try {
      upstream = await fetch(target, {
        headers: { Accept: request.headers.accept ?? '*/*' },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const proxyError = new Error(
        `Daytona preview request failed. ${error instanceof Error ? error.message : ''}`.trim(),
      );
      Object.assign(proxyError, { statusCode: 502 });
      throw proxyError;
    }

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) reply.header('Cache-Control', cacheControl);
    reply.status(upstream.status).type(contentType);
    if (contentType.includes('text/html')) {
      return reply.send(rebasePreviewHtml(await upstream.text()));
    }
    return reply.send(Buffer.from(await upstream.arrayBuffer()));
  };

  app.get('/runs/:runId/branches/:branchId/preview', proxyPreview);
  app.get('/runs/:runId/branches/:branchId/preview/*', proxyPreview);

  app.post('/runs', async (request, reply) => {
    const body = GenerateRequest.parse(request.body);
    const integrityIssues = findCanvasIntegrityIssues(body.canvas);
    if (integrityIssues.length > 0) {
      return reply.status(400).send({ error: 'canvas_integrity_error', issues: integrityIssues });
    }

    // Honour a client-chosen id so the browser can stream events while this
    // request is still running — but only when it is genuinely free, so a
    // replayed or malformed id can never collide with or overwrite a real run.
    const runId =
      body.runId && (await store.readRun(body.runId)) === null
        ? body.runId
        : `run-${nanoid(12).toLowerCase()}`;
    const createdAt = now();
    let run = RunRecord.parse({
      version: 1,
      id: runId,
      status: 'running',
      stage: 'canvas-received',
      canvas: body.canvas,
      spec: null,
      specHash: null,
      candidates: [],
      branches: [],
      recommendations: [],
      patches: [],
      contrastSummary: '',
      championBranchId: null,
      error: null,
      createdAt,
      updatedAt: createdAt,
    });
    await store.createRun(run, body.canvasImage);

    const startedAt = Date.now();
    await emit(event(runId, { type: 'run-started', canvasId: body.canvas.id, title: body.canvas.title }));
    await emit(event(runId, { type: 'stage-started', stage: 'pre-pass', label: 'Mapping stamps and arrows' }));
    let spec = compileScreenSpec(body.canvas);
    await emit(
      event(runId, {
        type: 'stage-finished',
        stage: 'pre-pass',
        outcome: 'ok',
        detail: 'Compiled the structured canvas deterministically.',
        durationMs: Date.now() - startedAt,
      }),
    );
    await emit(event(runId, { type: 'stage-started', stage: 'interpreting', label: 'Interpreting wireframe' }));
    let interpretationOutcome: 'ok' | 'degraded' = 'degraded';
    let interpretationDetail = options.config.integrations.ai.detail;
    if (options.config.credentials?.ai) {
      try {
        const interpretation = await interpretScreenSpec({
          credentials: options.config.credentials.ai,
          canvas: body.canvas,
          canvasImage: body.canvasImage,
          deterministicSpec: spec,
        });
        spec = interpretation.spec;
        interpretationOutcome = 'ok';
        interpretationDetail = interpretation.repaired
          ? 'The AI interpretation passed after one structured-output repair.'
          : 'The AI interpretation passed strict structured-output validation.';
      } catch (error) {
        interpretationDetail = `AI interpretation failed; retained the deterministic Screen Spec. ${error instanceof Error ? error.message : ''}`.trim();
      }
    }
    const resolvedSpecHash = hashSpec(spec);
    await emit(
      event(runId, {
        type: 'stage-finished',
        stage: 'interpreting',
        outcome: interpretationOutcome,
        detail: interpretationDetail,
        durationMs: 0,
      }),
    );
    await emit(
      event(runId, {
        type: 'spec-ready',
        specId: spec.id,
        specHash: resolvedSpecHash,
        regionCount: spec.regions.length,
        stateCount: spec.states.length,
        interactionCount: spec.interactions.length,
      }),
    );

    await emit(event(runId, { type: 'stage-started', stage: 'visual-matching', label: 'Matching visual UI patterns' }));
    // The archetype must reach the matcher, not just the compiler: without it
    // every run resolved candidates against `application`'s intent tags, so a
    // marketing or portfolio canvas almost never matched its own hero, marquee,
    // or aurora-panel records no matter what the toolbar said.
    let candidates = buildCandidates(spec, body.canvas.designPreferences.archetype);
    let matchingOutcome: 'ok' | 'degraded' = 'degraded';
    let matchingDetail = options.config.integrations.visualRanking.detail;
    if (options.config.credentials?.ai) {
      try {
        candidates = await rankWithOpenAi({
          credentials: options.config.credentials.ai,
          canvas: body.canvas,
          spec,
          candidates,
        });
        matchingOutcome = 'ok';
        matchingDetail = 'OpenAI vision ranked the reviewed candidate sheets against each wireframe region.';
      } catch (error) {
        matchingDetail = `OpenAI visual ranking failed; retained reviewed local matches. ${error instanceof Error ? error.message : ''}`.trim();
      }
    }
    for (const candidate of candidates) {
      await emit(
        event(runId, {
          type: 'matches-ready',
          regionId: candidate.regionId,
          matchSource: candidate.matches[0]?.matchSource ?? 'local',
          matches: candidate.matches,
          degradedReason: candidate.matches[0]?.matchSource === 'openai' ? null : matchingDetail,
        }),
      );
    }
    await emit(event(runId, { type: 'stage-started', stage: 'licence-gate', label: 'Checking licences and compatibility' }));
    for (const candidate of candidates) {
      for (const match of candidate.matches) {
        const record = getRegistryRecord(match.recordId);
        const verdict = record ? assessRecord(record) : { allowed: false, reason: 'Registry record was not found.' };
        await emit(
          event(runId, {
            type: 'gate-decision',
            regionId: candidate.regionId,
            recordId: match.recordId,
            allowed: verdict.allowed,
            reason: verdict.reason,
          }),
        );
      }
      for (const rejected of candidate.rejected) {
        await emit(
          event(runId, {
            type: 'gate-decision',
            regionId: candidate.regionId,
            recordId: rejected.recordId,
            allowed: false,
            reason: rejected.reason,
          }),
        );
      }
    }
    await emit(
      event(runId, {
        type: 'stage-finished',
        stage: 'licence-gate',
        outcome: 'ok',
        detail: 'Every selected local candidate passed the registry preview, licence, and primitive-stack gate.',
        durationMs: 0,
      }),
    );
    await emit(
      event(runId, {
        type: 'stage-finished',
        stage: 'visual-matching',
        outcome: matchingOutcome,
        detail: matchingDetail,
        durationMs: 0,
      }),
    );

    await emit(event(runId, { type: 'stage-started', stage: 'proposing-directions', label: 'Proposing three directions' }));
    let manifests = buildDirections({
      runId,
      spec,
      specHash: resolvedSpecHash,
      candidates,
      designPreferences: body.canvas.designPreferences,
      createdAt,
    });
    let directionsOutcome: 'ok' | 'degraded' = 'degraded';
    let directionsDetail = 'Three deterministic local directions were created without a live AI generator.';
    let contrastSummary =
      'Calm Trust prioritises steady hierarchy, Playful Momentum amplifies feedback, and Editorial Precision optimises scanning; all share one Screen Spec.';
    if (options.config.credentials?.ai) {
      try {
        const directions = await proposeDirections({
          credentials: options.config.credentials.ai,
          spec,
          selectionOptions: directionSelectionOptions({ spec, candidates }),
          designPreferences: body.canvas.designPreferences,
          validate: (directionSet) =>
            buildDirectionsFromAi({
              runId,
              spec,
              specHash: resolvedSpecHash,
              candidates,
              designPreferences: body.canvas.designPreferences,
              directionSet,
              createdAt,
            }),
        });
        manifests = directions.value;
        directionsOutcome = 'ok';
        directionsDetail = directions.repaired
          ? 'The AI produced three directions after one structured-output repair.'
          : 'The AI produced three validated directions from the shared Screen Spec.';
        contrastSummary = directions.contrastSummary;
      } catch (error) {
        directionsDetail =
          `AI direction generation failed; retained deterministic local directions. ${
            error instanceof Error ? error.message : ''
          }`.trim();
      }
    }
    if (manifests.length !== 3) throw new Error(`Expected exactly three directions, received ${manifests.length}.`);
    const runIntegrity = (candidateManifests: typeof manifests) => {
      for (const manifest of candidateManifests) {
        const issues = [
          ...findManifestIntegrityIssues(manifest, spec, resolvedSpecHash),
          ...findManifestContextIssues(manifest, spec, patternContext),
        ];
        if (issues.length > 0) throw new Error(`Direction "${manifest.name}" failed integrity checks: ${issues.join(' ')}`);
      }
    };
    runIntegrity(manifests);
    await emit(
      event(runId, {
        type: 'stage-finished',
        stage: 'proposing-directions',
        outcome: directionsOutcome,
        detail: directionsDetail,
        durationMs: 0,
      }),
    );

    // Layout audit: a static pass over each finalised manifest for the choices
    // known to render badly — a region on the neutral fallback when a richer
    // pattern was approved, a roomy density on a working surface, glass over a
    // flat ground — plus any measured accessibility floor it misses. When the AI
    // is configured, the defects are fed back for up to two revision rounds. The
    // measured findings are kept regardless, so the loop never ships a run worse
    // than it would have been without it.
    await emit(event(runId, { type: 'stage-started', stage: 'layout-audit', label: 'Auditing layout' }));
    const directionSelections = directionSelectionOptions({ spec, candidates });
    const auditDirections = (candidateManifests: typeof manifests) =>
      candidateManifests
        .map((manifest) => {
          const risk = findLayoutRiskIssues({ manifest, spec, selectionOptions: directionSelections });
          const missed = measureBranch(manifest, spec.accessibility).filter((entry) => !entry.passes);
          return {
            branchName: manifest.name,
            issues: [
              ...risk.map((issue) => issue.detail),
              ...missed.map((entry) => `${entry.label}: ${entry.evidence}`),
            ],
          };
        })
        .filter((entry) => entry.issues.length > 0);

    let auditRounds = 0;
    let auditDefects = auditDirections(manifests);
    let auditOutcome: 'ok' | 'degraded' = auditDefects.length === 0 ? 'ok' : 'degraded';
    let auditDetail =
      auditDefects.length === 0
        ? 'Every direction cleared the layout-risk and accessibility checks.'
        : `${auditDefects.length} direction(s) had layout issues and no live AI generator was available to revise them.`;
    if (auditDefects.length > 0 && options.config.credentials?.ai) {
      while (auditDefects.length > 0 && auditRounds < 2) {
        auditRounds += 1;
        try {
          const revised = await reviseDirections({
            credentials: options.config.credentials.ai,
            spec,
            selectionOptions: directionSelections,
            designPreferences: body.canvas.designPreferences,
            current: manifests,
            defects: auditDefects,
            validate: (directionSet) =>
              buildDirectionsFromAi({
                runId,
                spec,
                specHash: resolvedSpecHash,
                candidates,
                designPreferences: body.canvas.designPreferences,
                directionSet,
                createdAt,
              }),
          });
          if (revised.value.length !== 3) break;
          runIntegrity(revised.value);
          manifests = revised.value;
          contrastSummary = revised.contrastSummary;
          auditDefects = auditDirections(manifests);
        } catch (error) {
          auditDetail = `Layout revision round ${auditRounds} failed; kept the prior directions. ${
            error instanceof Error ? error.message : ''
          }`.trim();
          auditDefects = auditDirections(manifests);
          break;
        }
      }
      if (!auditDetail.startsWith('Layout revision')) {
        auditDetail =
          auditDefects.length === 0
            ? auditRounds === 0
              ? 'Every direction cleared the layout-risk and accessibility checks.'
              : `Layout issues cleared after ${auditRounds} revision round${auditRounds === 1 ? '' : 's'}.`
            : `${auditDefects.length} direction(s) still have layout issues after ${auditRounds} revision round${
                auditRounds === 1 ? '' : 's'
              }: ${auditDefects.flatMap((entry) => entry.issues).join(' ')}`;
      }
      auditOutcome = auditDefects.length === 0 ? 'ok' : 'degraded';
    }

    let branches: RunRecordType['branches'] = manifests.map((manifest) => ({
      id: manifest.id,
      runId,
      name: manifest.name,
      origin: 'direction' as const,
      status: 'stopped' as const,
      manifest,
      sandboxId: null,
      previewUrl: null,
      previewToken: null,
      error: null,
      logTail: [],
      isChampion: false,
      createdAt,
      updatedAt: createdAt,
    }));
    const materializedBranches = new Map(
      branches.map((branch) => [branch.id, materializeBranch(spec, branch.manifest)]),
    );
    for (const branch of branches) {
      await emit(event(runId, { type: 'branch-proposed', branchId: branch.id, name: branch.name, genome: branch.manifest.genome }));
    }
    await emit(
      event(runId, {
        type: 'stage-finished',
        stage: 'layout-audit',
        outcome: auditOutcome,
        detail: auditDetail,
        durationMs: 0,
      }),
    );
    await emit(event(runId, { type: 'stage-started', stage: 'sandbox-launch', label: 'Starting live branches' }));
    let sandboxOutcome: 'ok' | 'degraded' = 'degraded';
    let sandboxDetail = options.config.integrations.daytona.detail;
    if (options.config.credentials?.daytona) {
      const manager = new DaytonaBranchManager(options.config.credentials.daytona);
      let sweepNote = '';
      try {
        const reachable = await collectLiveSandboxIds();
        // `null` means at least one run snapshot could not be read, so the set of
        // reachable sandboxes is unknown. Sweeping on a partial set would stop a
        // sandbox someone is still previewing, so the sweep is skipped instead.
        if (reachable) {
          const stopped = await manager.stopOrphanedSandboxes({
            liveSandboxIds: reachable,
            activeRunId: runId,
          });
          if (stopped.length > 0) {
            sweepNote = ` Stopped ${stopped.length} orphaned sandbox${stopped.length === 1 ? '' : 'es'} left running by an earlier run.`;
          }
        }
      } catch (error) {
        // Reclaiming stale infrastructure is a cost optimisation. It must never
        // be the reason a run cannot start.
        app.log.warn(
          `Orphaned-sandbox sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      // Branches are independent Daytona sandboxes, so launching them
      // concurrently instead of one after another turns three sequential
      // create+upload+build+boot cycles into one wall-clock cycle — the
      // single largest lever on "time to live preview".
      const launches = await Promise.all(
        branches.map(async (branch) => {
          await emit(
            event(runId, {
              type: 'branch-status',
              branchId: branch.id,
              status: 'creating',
              detail: 'Creating Daytona sandbox from the configured snapshot.',
            }),
          );
          const launch = await manager.launch({
            runId,
            branch,
            files: materializedBranches.get(branch.id) ?? [],
          });
          return { branch, launch };
        }),
      );
      const launchedBranches: RunRecordType['branches'][number][] = [];
      for (const { branch, launch } of launches) {
        // Two branches in one sandbox would overwrite each other's generated
        // modules and serve a single shared bundle under three names. That is a
        // silent, expensive failure, so it is reported as a failed branch rather
        // than left to look like a working comparison.
        const collision = launch.sandboxId
          ? launchedBranches.find((entry) => entry.sandboxId === launch.sandboxId)
          : undefined;
        const launched = collision
          ? {
              ...launch,
              status: 'failed' as const,
              previewUrl: null,
              previewToken: null,
              error: `Sandbox ${launch.sandboxId} is already serving branch "${collision.name}". Branches may not share a sandbox.`,
            }
          : launch;
        await emit(
          event(runId, {
            type: 'branch-status',
            branchId: branch.id,
            status: launched.status,
            detail:
              launched.status === 'serving'
                ? 'Generated modules were uploaded and the signed preview is serving.'
                : launched.error ?? 'Daytona branch launch failed.',
          }),
        );
        launchedBranches.push({ ...branch, ...launched, updatedAt: now() });
      }
      branches = launchedBranches;
      const servingCount = branches.filter((branch) => branch.status === 'serving').length;
      sandboxOutcome = servingCount === branches.length ? 'ok' : 'degraded';
      sandboxDetail =
        (servingCount === branches.length
          ? 'Three Daytona preview branches are serving.'
          : `${servingCount} of ${branches.length} Daytona branches are serving; failed branches remain visible.`) + sweepNote;
    } else {
      for (const branch of branches) {
        await emit(
          event(runId, {
            type: 'branch-status',
            branchId: branch.id,
            status: 'stopped',
            detail: 'Manifest ready locally; no Daytona sandbox was claimed.',
          }),
        );
      }
    }
    await emit(
      event(runId, {
        type: 'stage-finished',
        stage: 'sandbox-launch',
        outcome: sandboxOutcome,
        detail: sandboxDetail,
        durationMs: 0,
      }),
    );

    run = RunRecord.parse({
      ...run,
      status: 'ready',
      stage: 'ready',
      spec,
      specHash: resolvedSpecHash,
      candidates,
      branches,
      contrastSummary,
      updatedAt: now(),
    });
    await emit(event(runId, { type: 'stage-started', stage: 'design-review', label: 'Reviewing each branch' }));
    const regionIds = new Set(spec.regions.map((region) => region.id));
    const selectionOptions = directionSelectionOptions({ spec, candidates });
    const recommendations: RecommendationType[] = [];
    let reviewOutcome: 'ok' | 'degraded' = 'degraded';
    let reviewDetail = 'Branches were reviewed against their measured accessibility floors only.';
    // Each branch's AI review is an independent OpenAI call, so reviewing all
    // three concurrently rather than one after another is another sequential
    // stage turned into one wall-clock round trip.
    const reviews = await Promise.all(
      run.branches.map(async (branch) => {
        const measured = measuredRecommendations({ branch, spec, candidates, createdAt });
        if (!options.config.credentials?.ai) return { measured, ai: null };
        try {
          const proposed = await proposeRecommendations({
            credentials: options.config.credentials.ai,
            spec,
            manifest: branch.manifest,
            measurements: measureBranch(branch.manifest, spec.accessibility),
            selectionOptions,
            validate: (set) =>
              adoptAiRecommendations({
                branch,
                drafts: set.recommendations,
                measured,
                regionIds,
                createdAt,
              }),
          });
          return { measured, ai: { ok: true as const, proposed } };
        } catch (error) {
          return { measured, ai: { ok: false as const, error } };
        }
      }),
    );
    for (const review of reviews) {
      recommendations.push(...review.measured);
      if (!review.ai) continue;
      if (review.ai.ok) {
        recommendations.push(...review.ai.proposed.value);
        reviewOutcome = 'ok';
        reviewDetail = review.ai.proposed.repaired
          ? 'The AI reviewed each branch after one structured-output repair, on top of the measured findings.'
          : 'The AI reviewed each branch on top of the measured accessibility findings.';
      } else {
        reviewDetail =
          `AI design review failed; kept the measured findings. ${review.ai.error instanceof Error ? review.ai.error.message : ''}`.trim();
      }
    }
    run = RunRecord.parse({ ...run, recommendations });
    await emit(
      event(runId, {
        type: 'stage-finished',
        stage: 'design-review',
        outcome: reviewOutcome,
        detail: reviewDetail,
        durationMs: 0,
      }),
    );
    await store.writeInitialArtifacts(run);
    for (const branch of run.branches) {
      await store.writeBranchFiles(runId, branch.id, materializedBranches.get(branch.id) ?? []);
    }
    await store.appendSnapshot(run);
    for (const recommendation of run.recommendations) {
      await emit(
        event(runId, {
          type: 'recommendation-ready',
          branchId: recommendation.branchId,
          recommendationId: recommendation.id,
          title: recommendation.title,
        }),
      );
    }
    await emit(event(runId, { type: 'run-finished', branchCount: 3, durationMs: Date.now() - startedAt }));
    return reply.status(201).send(publicRun(run));
  });

  app.get('/runs/:runId', async (request) => {
    const { runId } = request.params as { runId: string };
    return publicRun(await requireRun(runId));
  });

  app.get('/runs/:runId/events', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const { replayOnly } = request.query as { replayOnly?: string };
    await requireRun(runId);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const write = (entry: RunEventType) => {
      reply.raw.write(`id: ${entry.id}\nevent: ${entry.type}\ndata: ${JSON.stringify(entry)}\n\n`);
    };
    for (const entry of await store.readEvents(runId)) write(entry);
    if (replayOnly === 'true') {
      reply.raw.end();
      return;
    }
    bus.on(runId, write);
    const heartbeat = setInterval(() => reply.raw.write(': keep-alive\n\n'), 15_000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      bus.off(runId, write);
    });
  });

  app.post('/runs/:runId/recommendations', async (request) => {
    const { runId } = request.params as { runId: string };
    const body = ApplyRecommendationRequest.parse(request.body);
    return withRunLock(runId, async () => {
      const run = await requireRun(runId);
      const recommendation = run.recommendations.find((entry) => entry.id === body.recommendationId);
      if (!recommendation) throw new Error(`Recommendation "${body.recommendationId}" was not found.`);
      const branchIndex = run.branches.findIndex((entry) => entry.id === recommendation.branchId);
      const branch = run.branches[branchIndex];
      if (!branch) throw new Error(`Recommendation branch "${recommendation.branchId}" was not found.`);

      let delta = recommendation.delta;
      if (!body.apply) {
        const mutations = (await store.readMutations(runId)) as MutationRecord[];
        const applied = [...mutations]
          .reverse()
          .find(
            (
              entry,
            ): entry is Extract<MutationRecord, { type: 'recommendation-applied' }> =>
              entry.type === 'recommendation-applied' && entry.recommendationId === recommendation.id,
          );
        if (!applied) throw new Error('This recommendation has no recorded applied state to revert.');
        delta = applied.revertTo;
      }
      const nextManifest = applyDelta(branch.manifest, delta, run.candidates);
      const updatedAt = now();
      const nextBranch = await syncLiveBranch(run, { ...branch, manifest: nextManifest, updatedAt });
      run.branches[branchIndex] = nextBranch;
      const recommendationIndex = run.recommendations.findIndex((entry) => entry.id === recommendation.id);
      run.recommendations[recommendationIndex] = { ...recommendation, state: body.apply ? 'applied' : 'reverted' };
      run.updatedAt = updatedAt;
      if (body.apply) {
        await store.appendMutation(runId, {
          type: 'recommendation-applied',
          recommendationId: recommendation.id,
          branchId: branch.id,
          revertTo: captureDelta(branch.manifest, recommendation.delta),
        } satisfies MutationRecord);
      }
      await store.appendManifestRevision(run, branch.id);
      await store.appendSnapshot(run);
      return publicRun(run);
    });
  });

  app.post('/runs/:runId/remixes', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = RemixRequest.parse(request.body);
    return withRunLock(runId, async () => {
      const run = await requireRun(runId);
      const createdAt = now();
      const manifest = createRemix({ id: `${runId}-remix-${nanoid(8).toLowerCase()}`, request: body, run, createdAt });
      if (run.spec) {
        // A remix composes trait groups from parent branches, so it can pair a
        // parent's expressive pattern selection with another parent's archetype.
        // Same backstop the directions get, so a remix cannot ship a context
        // mismatch a person would only catch in the rendered preview.
        const contextIssues = findManifestContextIssues(manifest, run.spec, patternContext);
        if (contextIssues.length > 0) {
          const error = new Error(contextIssues.join(' '));
          Object.assign(error, { statusCode: 422 });
          throw error;
        }
      }
      let branch: RunRecordType['branches'][number] = {
        id: manifest.id,
        runId,
        name: manifest.name,
        origin: 'remix' as const,
        status: 'stopped' as const,
        manifest,
        sandboxId: null,
        previewUrl: null,
        previewToken: null,
        error: null,
        logTail: [],
        isChampion: false,
        createdAt,
        updatedAt: createdAt,
      };
      const files = run.spec ? materializeBranch(run.spec, branch.manifest) : [];
      if (options.config.credentials?.daytona && run.spec) {
        const manager = new DaytonaBranchManager(options.config.credentials.daytona);
        await emit(
          event(runId, {
            type: 'branch-status',
            branchId: branch.id,
            status: 'creating',
            detail: 'Creating a Daytona sandbox for the manifest-only remix.',
          }),
        );
        const launched = await manager.launch({ runId, branch, files });
        branch = { ...branch, ...launched, updatedAt: now() };
      }
      run.branches.push(branch);
      run.updatedAt = createdAt;
      await store.appendManifestRevision(run, branch.id);
      await store.writeBranchFiles(runId, branch.id, files);
      await store.appendSnapshot(run);
      await emit(event(runId, { type: 'branch-proposed', branchId: branch.id, name: branch.name, genome: manifest.genome }));
      await emit(
        event(runId, {
          type: 'branch-status',
          branchId: branch.id,
          status: branch.status,
          detail:
            branch.status === 'serving'
              ? 'Remix modules were uploaded to a new Daytona preview branch.'
              : branch.error ?? 'Remix manifest ready locally; no Daytona sandbox was claimed.',
        }),
      );
      return reply.status(201).send(publicBranch(branch));
    });
  });

  app.delete('/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    return withRunLock(runId, async () => {
      const run = await requireRun(runId);
      const sandboxIds = run.branches
        .map((branch) => branch.sandboxId)
        .filter((id): id is string => Boolean(id));

      if (options.config.credentials?.daytona && sandboxIds.length > 0) {
        const manager = new DaytonaBranchManager(options.config.credentials.daytona);
        const results = await Promise.allSettled(sandboxIds.map((id) => manager.deleteSandbox(id)));
        const failed = results.filter((result) => result.status === 'rejected').length;
        if (failed > 0) {
          return reply.status(502).send({
            error: `Could not delete ${failed} of ${sandboxIds.length} live sandbox${
              sandboxIds.length === 1 ? '' : 'es'
            } for "${run.canvas.title}". Nothing was removed; retry deleting the workspace.`,
          });
        }
      }

      await store.deleteRun(runId);
      return reply.status(204).send();
    });
  });

  app.delete('/runs/:runId/branches/:branchId', async (request, reply) => {
    const { runId, branchId } = request.params as { runId: string; branchId: string };
    return withRunLock(runId, async () => {
      const run = await requireRun(runId);
      const branch = run.branches.find((entry) => entry.id === branchId);
      if (!branch) return reply.status(404).send({ error: `Branch "${branchId}" was not found.` });
      if (run.branches.length <= 1) {
        return reply.status(409).send({ error: 'Keep at least one branch in the active run.' });
      }
      if (run.championBranchId === branch.id || branch.isChampion) {
        return reply.status(409).send({ error: 'Choose another champion before deleting this branch.' });
      }
      const dependents = run.branches.filter(
        (candidate) =>
          candidate.id !== branch.id && candidate.manifest.lineage.parentBranchIds.includes(branch.id),
      );
      if (dependents.length > 0) {
        return reply.status(409).send({
          error: `Cannot delete "${branch.name}" while ${dependents.map((entry) => `"${entry.name}"`).join(', ')} depends on its lineage.`,
        });
      }

      if (options.config.credentials?.daytona && branch.sandboxId) {
        try {
          await new DaytonaBranchManager(options.config.credentials.daytona).stopAndArchive(branch.sandboxId);
        } catch (error) {
          return reply.status(502).send({
            error: `Could not archive the live branch before deletion. ${
              error instanceof Error ? error.message : 'Daytona retirement failed.'
            }`,
          });
        }
      }

      const deletedAt = now();
      run.branches = run.branches.filter((entry) => entry.id !== branch.id);
      run.recommendations = run.recommendations.filter((entry) => entry.branchId !== branch.id);
      run.patches = run.patches.filter((entry) => entry.branchId !== branch.id);
      run.updatedAt = deletedAt;
      await store.appendMutation(runId, {
        type: 'branch-deleted',
        branchId: branch.id,
        branchName: branch.name,
        deletedAt,
      } satisfies MutationRecord);
      await store.appendSnapshot(run);
      await emit(
        event(runId, {
          type: 'branch-status',
          branchId: branch.id,
          status: 'archived',
          detail: 'Branch removed from the active run; historical snapshots remain available.',
        }),
      );
      return publicRun(run);
    });
  });

  app.post('/runs/:runId/patches', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = PatchRequest.parse(request.body);
    return withRunLock(runId, async () => {
      const run = await requireRun(runId);
      const branchIndex = run.branches.findIndex((entry) => entry.id === body.branchId);
      const branch = run.branches[branchIndex];
      if (!branch) throw new Error(`Branch "${body.branchId}" was not found.`);
      const patchId = `${branch.id}-patch-${nanoid(8).toLowerCase()}`;
      const createdAt = now();
      // The heuristic is the floor, not the default: it cannot read a request it
      // has no keyword for, so it is what runs when there is no AI, the AI fails,
      // or the AI proposes nothing that would actually move.
      const interpreted = options.config.credentials?.ai
        ? await aiPatchInstruction({
            credentials: options.config.credentials.ai,
            run,
            branch,
            regionId: body.regionId,
            request: body.request,
            id: patchId,
            createdAt,
          })
        : null;
      const patch =
        interpreted ??
        makePatch({
          id: patchId,
          branch,
          regionId: body.regionId,
          request: body.request,
          candidates: run.candidates,
          createdAt,
        });
      const manifest = applyDelta(branch.manifest, patch.delta, run.candidates);
      const applied = { ...patch, state: 'applied' as const };
      const nextBranch = await syncLiveBranch(run, { ...branch, manifest, updatedAt: now() });
      run.branches[branchIndex] = nextBranch;
      run.patches.push(applied);
      run.updatedAt = now();
      await store.appendMutation(runId, { type: 'patch-applied', patch: applied });
      await store.appendManifestRevision(run, branch.id);
      await store.appendSnapshot(run);
      await emit(event(runId, { type: 'patch-applied', branchId: branch.id, patchId: applied.id, regionId: applied.regionId }));
      return reply.status(201).send(applied);
    });
  });

  app.delete('/runs/:runId/patches/:patchId', async (request, reply) => {
    const { runId, patchId } = request.params as { runId: string; patchId: string };
    return withRunLock(runId, async () => {
      const run = await requireRun(runId);
      const patchIndex = run.patches.findIndex((entry) => entry.id === patchId);
      const patch = run.patches[patchIndex];
      if (!patch) return reply.status(404).send({ error: `Patch "${patchId}" was not found.` });
      const branchIndex = run.branches.findIndex((entry) => entry.id === patch.branchId);
      const branch = run.branches[branchIndex];
      if (!branch) return reply.status(404).send({ error: `Branch "${patch.branchId}" was not found.` });

      const manifest = applyDelta(branch.manifest, patch.revertTo, run.candidates);
      const nextBranch = await syncLiveBranch(run, { ...branch, manifest, updatedAt: now() });
      run.branches[branchIndex] = nextBranch;
      run.patches.splice(patchIndex, 1);
      run.updatedAt = now();
      await store.appendMutation(runId, {
        type: 'patch-deleted',
        patchId: patch.id,
        branchId: patch.branchId,
        revertTo: patch.revertTo,
      } satisfies MutationRecord);
      await store.appendManifestRevision(run, branch.id);
      await store.appendSnapshot(run);
      await emit(event(runId, { type: 'patch-deleted', branchId: patch.branchId, patchId: patch.id, regionId: patch.regionId }));
      return publicRun(run);
    });
  });

  app.post('/runs/:runId/champion', async (request) => {
    const { runId } = request.params as { runId: string };
    const body = SelectChampionRequest.parse(request.body);
    return withRunLock(runId, async () => {
      const run = await requireRun(runId);
      if (!run.branches.some((branch) => branch.id === body.branchId)) {
        throw new Error(`Branch "${body.branchId}" was not found.`);
      }
      const retiredBranchIds: string[] = [];
      const retirementErrors = new Map<string, string>();
      if (body.retireOthers && options.config.credentials?.daytona) {
        const manager = new DaytonaBranchManager(options.config.credentials.daytona);
        await Promise.all(
          run.branches
            .filter((branch) => branch.id !== body.branchId && branch.sandboxId)
            .map(async (branch) => {
              try {
                await manager.stopAndArchive(branch.sandboxId!);
              } catch (error) {
                retirementErrors.set(
                  branch.id,
                  error instanceof Error ? error.message : 'Daytona retirement failed.',
                );
              }
            }),
        );
      }
      const updatedAt = now();
      run.branches = run.branches.map((branch) => {
        if (branch.id === body.branchId) return { ...branch, isChampion: true, updatedAt };
        if (body.retireOthers) {
          const error = retirementErrors.get(branch.id);
          if (error) {
            return {
              ...branch,
              isChampion: false,
              status: 'failed' as const,
              error,
              updatedAt,
            };
          }
          retiredBranchIds.push(branch.id);
          return { ...branch, isChampion: false, status: 'archived' as const, updatedAt };
        }
        return { ...branch, isChampion: false, updatedAt };
      });
      run.championBranchId = body.branchId;
      run.updatedAt = updatedAt;
      await store.appendSnapshot(run);
      await emit(event(runId, { type: 'champion-selected', branchId: body.branchId, retiredBranchIds }));
      return publicRun(run);
    });
  });

  return app;
}
