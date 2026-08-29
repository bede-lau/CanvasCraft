import { readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { getRegistryRecord } from '@canvascraft/registry';
import type { CanvasDoc, RegionCandidates, ScreenSpec } from '@canvascraft/schema';

import type { IntegrationCredentials } from './config.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');

interface NosanaResponse {
  model: string;
  matches: Array<{ id: string; score: number }>;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

async function toDataUrl(buffer: Buffer): Promise<string> {
  const png = await sharp(buffer).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function renderRegion(canvas: CanvasDoc, region: ScreenSpec['regions'][number]): Promise<string> {
  const width = 720;
  const height = 480;
  const focal = region.sourceBounds;
  const sx = width / canvas.size.width;
  const sy = height / canvas.size.height;
  const marks = canvas.elements
    .map((element) => {
      const selected = element.id === region.sourceElementId;
      return `<rect x="${Math.round(element.bounds.x * sx)}" y="${Math.round(element.bounds.y * sy)}" width="${Math.max(8, Math.round(element.bounds.width * sx))}" height="${Math.max(8, Math.round(element.bounds.height * sy))}" rx="7" fill="${selected ? '#e9b45d' : '#3b4555'}" opacity="${selected ? '1' : '.76'}" />`;
    })
    .join('');
  const label = `<text x="24" y="42" fill="#f3f5f7" font-family="Arial, sans-serif" font-size="22">${escapeXml(region.label)}</text>`;
  const outline = focal
    ? `<rect x="${Math.round(focal.x * sx)}" y="${Math.round(focal.y * sy)}" width="${Math.max(8, Math.round(focal.width * sx))}" height="${Math.max(8, Math.round(focal.height * sy))}" rx="8" fill="none" stroke="#ffd487" stroke-width="4" />`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#11151c"/>${marks}${outline}${label}</svg>`;
  return toDataUrl(Buffer.from(svg));
}

async function candidateImage(recordId: string): Promise<string> {
  const record = getRegistryRecord(recordId);
  if (!record) throw new Error(`Registry record "${recordId}" was not found.`);
  const location = path.join(ROOT, 'packages', 'registry', record.thumbnail);
  return toDataUrl(await readFile(location));
}

async function rankRegion(
  endpoint: string,
  apiKey: string | null,
  canvas: CanvasDoc,
  region: ScreenSpec['regions'][number],
  candidate: RegionCandidates,
): Promise<RegionCandidates> {
  const matches = candidate.matches;
  if (matches.length === 0) return candidate;
  const response = await fetch(`${endpoint}/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
    },
    body: JSON.stringify({
      query: { image_base64: await renderRegion(canvas, region) },
      candidates: await Promise.all(
        matches.map(async (match) => ({
          id: match.recordId,
          image: { image_base64: await candidateImage(match.recordId) },
        })),
      ),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`Nosana matcher returned ${response.status} ${response.statusText}.`);
  }
  const payload = (await response.json()) as NosanaResponse;
  if (!Array.isArray(payload.matches)) throw new Error('Nosana matcher returned an invalid match payload.');
  const scores = new Map(
    payload.matches
      .filter((match) => typeof match.id === 'string' && Number.isFinite(match.score))
      .map((match) => [match.id, Math.max(0, Math.min(1, match.score))]),
  );
  if (scores.size === 0) throw new Error('Nosana matcher did not score any supplied candidates.');
  return {
    ...candidate,
    matches: matches
      .map((match) => ({
        ...match,
        score: Number((scores.get(match.recordId) ?? match.score).toFixed(3)),
        matchSource: 'nosana' as const,
        rationale: `Nosana CLIP visual similarity score for the highlighted ${region.label} region.`,
      }))
      .sort((left, right) => right.score - left.score),
  };
}

export async function rankWithNosana(args: {
  credentials: NonNullable<IntegrationCredentials['nosana']>;
  canvas: CanvasDoc;
  spec: ScreenSpec;
  candidates: RegionCandidates[];
}): Promise<RegionCandidates[]> {
  const regions = new Map(args.spec.regions.map((region) => [region.id, region]));
  return Promise.all(
    args.candidates.map(async (candidate) => {
      const region = regions.get(candidate.regionId);
      return region
        ? rankRegion(args.credentials.endpoint, args.credentials.apiKey, args.canvas, region, candidate)
        : candidate;
    }),
  );
}
