import { EventEmitter } from 'node:events';

import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { ZodError } from 'zod';

import {
  ApplyRecommendationRequest,
  GenerateRequest,
  PatchRequest,
  RemixRequest,
  RunEvent,
  RunRecord,
  SelectChampionRequest,
  findCanvasIntegrityIssues,
  findManifestIntegrityIssues,
  type ManifestDelta,
  type Recommendation,
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
import { type OrchestratorConfig } from './config.js';
import { interpretScreenSpec, proposeDirections } from './ai.js';
import { materializeBranch } from './branch-materializer.js';
import { DaytonaBranchManager } from './daytona.js';
import { applyDelta, captureDelta, createRemix, makePatch } from './mutations.js';
import { rankWithNosana } from './nosana.js';
import { RunStore } from './store.js';

interface MutationRecord {
  type: 'recommendation-applied';
  recommendationId: string;
  branchId: string;
  revertTo: ManifestDelta;
}

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

function makeRecommendations(run: RunRecordType): Recommendation[] {
  return run.branches.slice(0, 3).map((branch, index) => ({
    id: `${branch.id}-recommendation`,
    branchId: branch.id,
    surface: index === 0 ? 'readability' : index === 1 ? 'motion' : 'touch-target',
    severity: index === 2 ? 'improvement' : 'polish',
    title:
      index === 0
        ? 'Increase body leading for long-form scanning'
        : index === 1
          ? 'Offer a calmer audition setting'
          : 'Increase control size for touch use',
    rationale:
      index === 0
        ? 'A small line-height increase improves scanability without changing content or layout.'
        : index === 1
          ? 'The direction stays expressive, while a shorter travel distance gives users a reversible lower-motion option.'
          : 'Larger icons make repeated controls easier to target while retaining the same interaction contract.',
    regionId: run.spec?.regions[index % run.spec.regions.length]?.id ?? null,
    delta:
      index === 0
        ? { typography: { bodyLeading: Math.min(1.9, branch.manifest.typography.bodyLeading + 0.1) }, selectionSwaps: [] }
        : index === 1
          ? { motion: { travel: 0.35, durationMs: 300 }, selectionSwaps: [] }
          : { controls: { iconSizePx: Math.min(24, branch.manifest.controls.iconSizePx + 2) }, selectionSwaps: [] },
    evidence: index === 2 ? 'Touch targets remain governed by the shared 44px accessibility floor.' : 'Deterministic local design review.',
    state: 'proposed',
    createdAt: run.createdAt,
  }));
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

  const syncLiveBranch = async (
    run: RunRecordType,
    branch: RunRecordType['branches'][number],
  ): Promise<void> => {
    if (!options.config.credentials?.daytona || !run.spec || !branch.sandboxId) return;
    const files = materializeBranch(run.spec, branch.manifest);
    const manager = new DaytonaBranchManager(options.config.credentials.daytona);
    await manager.syncGeneratedModules(branch.sandboxId, files);
    await store.writeBranchFiles(run.id, branch.id, files);
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

    const runId = `run-${nanoid(12).toLowerCase()}`;
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
    let candidates = buildCandidates(spec);
    let matchingOutcome: 'ok' | 'degraded' = 'degraded';
    let matchingDetail = options.config.integrations.nosana.detail;
    if (options.config.credentials?.nosana) {
      try {
        candidates = await rankWithNosana({
          credentials: options.config.credentials.nosana,
          canvas: body.canvas,
          spec,
          candidates,
        });
        matchingOutcome = 'ok';
        matchingDetail = 'Nosana CLIP ranked the reviewed candidate thumbnails against each canvas region.';
      } catch (error) {
        matchingDetail = `Nosana matching failed; retained reviewed local matches. ${error instanceof Error ? error.message : ''}`.trim();
      }
    }
    for (const candidate of candidates) {
      await emit(
        event(runId, {
          type: 'matches-ready',
          regionId: candidate.regionId,
          matchSource: candidate.matches[0]?.matchSource ?? 'local',
          matches: candidate.matches,
          degradedReason: candidate.matches[0]?.matchSource === 'nosana' ? null : matchingDetail,
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
    let manifests = buildDirections({ runId, spec, specHash: resolvedSpecHash, candidates, createdAt });
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
          validate: (directionSet) =>
            buildDirectionsFromAi({
              runId,
              spec,
              specHash: resolvedSpecHash,
              candidates,
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
    for (const manifest of manifests) {
      const issues = findManifestIntegrityIssues(manifest, spec, resolvedSpecHash);
      if (issues.length > 0) throw new Error(`Direction "${manifest.name}" failed integrity checks: ${issues.join(' ')}`);
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
        stage: 'proposing-directions',
        outcome: directionsOutcome,
        detail: directionsDetail,
        durationMs: 0,
      }),
    );
    await emit(event(runId, { type: 'stage-started', stage: 'sandbox-launch', label: 'Starting live branches' }));
    let sandboxOutcome: 'ok' | 'degraded' = 'degraded';
    let sandboxDetail = options.config.integrations.daytona.detail;
    if (options.config.credentials?.daytona) {
      const manager = new DaytonaBranchManager(options.config.credentials.daytona);
      const launchedBranches: RunRecordType['branches'][number][] = [];
      for (const branch of branches) {
        await emit(
          event(runId, {
            type: 'branch-status',
            branchId: branch.id,
            status: 'creating',
            detail: 'Creating Daytona sandbox from the configured snapshot.',
          }),
        );
        const launched = await manager.launch({
          runId,
          branch,
          files: materializedBranches.get(branch.id) ?? [],
        });
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
        servingCount === branches.length
          ? 'Three Daytona preview branches are serving.'
          : `${servingCount} of ${branches.length} Daytona branches are serving; failed branches remain visible.`;
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
    run = RunRecord.parse({ ...run, recommendations: makeRecommendations(run) });
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
          .find((entry) => entry.type === 'recommendation-applied' && entry.recommendationId === recommendation.id);
        if (!applied) throw new Error('This recommendation has no recorded applied state to revert.');
        delta = applied.revertTo;
      }
      const nextManifest = applyDelta(branch.manifest, delta, run.candidates);
      const updatedAt = now();
      const nextBranch = { ...branch, manifest: nextManifest, updatedAt };
      await syncLiveBranch(run, nextBranch);
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

  app.post('/runs/:runId/patches', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = PatchRequest.parse(request.body);
    return withRunLock(runId, async () => {
      const run = await requireRun(runId);
      const branchIndex = run.branches.findIndex((entry) => entry.id === body.branchId);
      const branch = run.branches[branchIndex];
      if (!branch) throw new Error(`Branch "${body.branchId}" was not found.`);
      const patch = makePatch({
        id: `${branch.id}-patch-${nanoid(8).toLowerCase()}`,
        branch,
        regionId: body.regionId,
        request: body.request,
        candidates: run.candidates,
        createdAt: now(),
      });
      const manifest = applyDelta(branch.manifest, patch.delta, run.candidates);
      const applied = { ...patch, state: 'applied' as const };
      const nextBranch = { ...branch, manifest, updatedAt: now() };
      await syncLiveBranch(run, nextBranch);
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
