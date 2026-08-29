import {
  ManifestDelta,
  PatchInstruction,
  VariantManifest,
  composeRemix,
  findManifestIntegrityIssues,
  type ManifestDelta as ManifestDeltaType,
  type PatchInstruction as PatchInstructionType,
  type RegionCandidates,
  type RemixRequest,
  type RunRecord,
  type VariantManifest as VariantManifestType,
} from '@canvascraft/schema';
import { assessRecord, getRegistryRecord } from '@canvascraft/registry';

const MOTION_INTENSITY = {
  none: 0,
  subtle: 1,
  moderate: 2,
  expressive: 3,
} as const;

function selectionFromRecord(
  current: VariantManifestType['selections'][number],
  recordId: string,
  candidates: RegionCandidates[],
): VariantManifestType['selections'][number] {
  const record = getRegistryRecord(recordId);
  if (!record) throw new Error(`Unknown registry pattern "${recordId}".`);
  const verdict = assessRecord(record);
  if (!verdict.allowed) throw new Error(verdict.reason ?? `Pattern "${recordId}" failed the registry gate.`);
  const match = candidates.flatMap((entry) => entry.matches).find((entry) => entry.recordId === recordId);
  return {
    ...current,
    recordId: record.id,
    source: record.source,
    sourceUrl: record.sourceUrl,
    license: record.license,
    licenseNotice: record.licenseNotice,
    matchScore: match?.score ?? current.matchScore,
    matchSource: match?.matchSource ?? 'local',
    whyItFits: match?.rationale ?? `Locally selected compatible ${record.name} pattern.`,
    fallbackReason: null,
  };
}

export function captureDelta(manifest: VariantManifestType, delta: ManifestDeltaType): ManifestDeltaType {
  const captured: ManifestDeltaType = { selectionSwaps: [] };
  if (delta.palette) captured.palette = Object.fromEntries(Object.keys(delta.palette).map((key) => [key, manifest.palette[key as keyof typeof manifest.palette]]));
  if (delta.typography) captured.typography = Object.fromEntries(Object.keys(delta.typography).map((key) => [key, manifest.typography[key as keyof typeof manifest.typography]]));
  if (delta.form) captured.form = Object.fromEntries(Object.keys(delta.form).map((key) => [key, manifest.form[key as keyof typeof manifest.form]]));
  if (delta.controls) captured.controls = Object.fromEntries(Object.keys(delta.controls).map((key) => [key, manifest.controls[key as keyof typeof manifest.controls]]));
  if (delta.motion) captured.motion = Object.fromEntries(Object.keys(delta.motion).map((key) => [key, manifest.motion[key as keyof typeof manifest.motion]]));
  captured.selectionSwaps = delta.selectionSwaps.flatMap((swap) => {
    const current = manifest.selections.find((selection) => selection.regionId === swap.regionId);
    return current ? [{ regionId: swap.regionId, recordId: current.recordId }] : [];
  });
  return ManifestDelta.parse(captured);
}

export function applyDelta(
  manifest: VariantManifestType,
  delta: ManifestDeltaType,
  candidates: RegionCandidates[],
): VariantManifestType {
  const selections = manifest.selections.map((selection) => {
    const swap = delta.selectionSwaps.find((entry) => entry.regionId === selection.regionId);
    return swap ? selectionFromRecord(selection, swap.recordId, candidates) : selection;
  });
  return VariantManifest.parse({
    ...manifest,
    palette: { ...manifest.palette, ...delta.palette },
    typography: { ...manifest.typography, ...delta.typography },
    form: { ...manifest.form, ...delta.form },
    controls: { ...manifest.controls, ...delta.controls },
    motion: { ...manifest.motion, ...delta.motion },
    selections,
  });
}

export function makePatch(args: {
  id: string;
  branch: RunRecord['branches'][number];
  regionId: string;
  request: string;
  candidates: RegionCandidates[];
  createdAt: string;
}): PatchInstructionType {
  const request = args.request.toLowerCase();
  const currentSelection = args.branch.manifest.selections.find((selection) => selection.regionId === args.regionId);
  if (!currentSelection) throw new Error(`Branch does not contain region "${args.regionId}".`);
  const regionCandidates = args.candidates.find((entry) => entry.regionId === args.regionId)?.matches ?? [];

  if (
    /(entire|all|global|branch-wide|everywhere|whole (screen|app)|theme|palette|colour|color|typography|font|density|radius|spacing|motion preset)/.test(
      request,
    )
  ) {
    const error = new Error(
      'This request implies a branch-wide trait change and cannot be represented honestly as a selected-region patch. Use a manifest remix or recommendation instead.',
    );
    Object.assign(error, { statusCode: 422 });
    throw error;
  }
  const requestedRecord = regionCandidates.find((candidate) => request.includes(candidate.recordId));
  const currentRecord = getRegistryRecord(currentSelection.recordId);
  const alternatives = regionCandidates.filter((candidate) => candidate.recordId !== currentSelection.recordId);
  const wantsCalmerPattern = /\b(calm|calmer|quiet|quieter|subtle|restrained|less motion)\b/.test(request);
  const calmerAlternatives = alternatives
    .filter((candidate) => {
      const candidateIntensity = getRegistryRecord(candidate.recordId)?.motionIntensity ?? 'expressive';
      const currentIntensity = currentRecord?.motionIntensity ?? 'expressive';
      return MOTION_INTENSITY[candidateIntensity] < MOTION_INTENSITY[currentIntensity];
    })
    .sort((left, right) => {
      const leftIntensity = getRegistryRecord(left.recordId)?.motionIntensity ?? 'expressive';
      const rightIntensity = getRegistryRecord(right.recordId)?.motionIntensity ?? 'expressive';
      return MOTION_INTENSITY[leftIntensity] - MOTION_INTENSITY[rightIntensity];
    });
  const alternate =
    requestedRecord ??
    (wantsCalmerPattern ? calmerAlternatives[0] ?? alternatives[0] : alternatives[0]);
  if (!alternate) throw new Error('No alternate gate-approved local pattern is available for this region.');
  const delta: ManifestDeltaType = { selectionSwaps: [{ regionId: args.regionId, recordId: alternate.recordId }] };
  const interpretation = `Swap only the selected region to the gate-approved local pattern "${alternate.recordId}".`;

  return PatchInstruction.parse({
    id: args.id,
    branchId: args.branch.id,
    regionId: args.regionId,
    request: args.request,
    interpretation,
    delta,
    revertTo: captureDelta(args.branch.manifest, delta),
    state: 'proposed',
    error: null,
    createdAt: args.createdAt,
  });
}

export function createRemix(args: {
  id: string;
  request: RemixRequest;
  run: RunRecord;
  createdAt: string;
}): VariantManifestType {
  const sources = Object.fromEntries(
    Object.entries(args.request.sources).map(([group, branchId]) => {
      const branch = args.run.branches.find((entry) => entry.id === branchId);
      if (!branch) throw new Error(`Unknown source branch "${branchId}" for ${group}.`);
      return [group, branch.manifest];
    }),
  ) as Parameters<typeof composeRemix>[0]['sources'];
  const remix = composeRemix({
    id: args.id,
    name: args.request.name,
    genome: `${sources.palette.palette.name} palette · ${sources.controls.controls.buttonShape} controls · ${sources.motion.motion.preset} motion`,
    rationale: 'Composes validated manifest traits without merging generated source files.',
    createdAt: args.createdAt,
    sources,
  });
  if (!args.run.spec || !args.run.specHash) throw new Error('Run has no shared Screen Spec.');
  const issues = findManifestIntegrityIssues(remix, args.run.spec, args.run.specHash);
  if (issues.length > 0) throw new Error(`Remix failed integrity checks: ${issues.join(' ')}`);
  return remix;
}
