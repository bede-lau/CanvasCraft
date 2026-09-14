import { readFile } from 'node:fs/promises';
import path from 'node:path';

import OpenAI from 'openai';
import sharp from 'sharp';
import { z } from 'zod';

import { getRegistryRecord } from '@canvascraft/registry';
import {
  toStrictJsonSchema,
  type CanvasDoc,
  type RegionCandidates,
  type ScreenSpec,
} from '@canvascraft/schema';

import type { IntegrationCredentials } from './config.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const RANKING_BATCH_SIZE = 8;

const VisionRankingResponse = z.object({
  rankings: z.array(
    z.object({
      regionId: z.string(),
      matches: z.array(
        z.object({
          recordId: z.string(),
          score: z.number().min(0).max(1),
          rationale: z.string().min(1).max(300),
        }),
      ),
    }),
  ),
});

const VISION_RANKING_SCHEMA = toStrictJsonSchema(VisionRankingResponse);
type VisionRankingResponse = z.infer<typeof VisionRankingResponse>;

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
  const width = 520;
  const height = 360;
  const focal = region.sourceBounds;
  const sx = width / canvas.size.width;
  const sy = height / canvas.size.height;
  const marks = canvas.elements
    .map((element) => {
      const selected = element.id === region.sourceElementId;
      return `<rect x="${Math.round(element.bounds.x * sx)}" y="${Math.round(element.bounds.y * sy)}" width="${Math.max(8, Math.round(element.bounds.width * sx))}" height="${Math.max(8, Math.round(element.bounds.height * sy))}" rx="7" fill="${selected ? '#e9b45d' : '#3b4555'}" opacity="${selected ? '1' : '.76'}" />`;
    })
    .join('');
  const label = `<text x="20" y="34" fill="#f3f5f7" font-family="Arial, sans-serif" font-size="18">${escapeXml(region.label)}</text>`;
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

async function renderComparisonSheet(
  canvas: CanvasDoc,
  region: ScreenSpec['regions'][number],
  candidate: RegionCandidates,
): Promise<string> {
  const target = await renderRegion(canvas, region);
  const thumbnailWidth = 240;
  const thumbnailHeight = 124;
  const gap = 16;
  const columns = 2;
  const rows = Math.ceil(candidate.matches.length / columns);
  const rightWidth = columns * thumbnailWidth + (columns - 1) * gap;
  const width = 520 + gap + rightWidth + 40;
  const height = Math.max(400, 54 + rows * (thumbnailHeight + 42 + gap));
  const images = await Promise.all(candidate.matches.map((match) => candidateImage(match.recordId)));
  const cards = images
    .map((image, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = 540 + column * (thumbnailWidth + gap);
      const y = 54 + row * (thumbnailHeight + 42 + gap);
      const recordId = candidate.matches[index]!.recordId;
      return [
        `<rect x="${x}" y="${y}" width="${thumbnailWidth}" height="${thumbnailHeight}" rx="8" fill="#ffffff" />`,
        `<image href="${image}" x="${x}" y="${y}" width="${thumbnailWidth}" height="${thumbnailHeight}" preserveAspectRatio="xMidYMid meet" />`,
        `<text x="${x}" y="${y + thumbnailHeight + 24}" fill="#f3f5f7" font-family="Arial, sans-serif" font-size="15">${escapeXml(recordId)}</text>`,
      ].join('');
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#11151c"/><text x="20" y="28" fill="#f3f5f7" font-family="Arial, sans-serif" font-size="18">Target wireframe region</text><image href="${target}" x="0" y="48" width="520" height="360" preserveAspectRatio="xMidYMid meet"/><text x="540" y="28" fill="#f3f5f7" font-family="Arial, sans-serif" font-size="18">Registry candidates</text>${cards}</svg>`;
  return toDataUrl(Buffer.from(svg));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function rankingPrompt(
  batch: readonly RegionCandidates[],
  regions: Map<string, ScreenSpec['regions'][number]>,
): string {
  const candidateContext = batch.map((candidate) => {
    const region = regions.get(candidate.regionId);
    return {
      regionId: candidate.regionId,
      label: region?.label ?? candidate.regionId,
      role: region?.role ?? 'unknown',
      candidates: candidate.matches.map((match) => {
        const record = getRegistryRecord(match.recordId);
        return {
          recordId: match.recordId,
          name: record?.name ?? match.recordId,
          usagePattern: record?.usagePattern ?? '',
          accessibilityNote: record?.accessibilityNote ?? '',
        };
      }),
    };
  });
  return [
    'You are a visual UI-pattern ranker for CanvasCraft.',
    'Each supplied comparison sheet has the target wireframe region on the left and its allowed registry candidates on the right.',
    'Rank visual and functional fit using hierarchy, layout, information density, control treatment, responsiveness, and the region role. Do not select an option because it is merely decorative.',
    'Return every region and every offered recordId exactly once. Do not invent ids. Scores are normalized visual-fit scores from 0 to 1, not cosine similarity.',
    'Keep each rationale concise and concrete. Do not claim a candidate is accessible unless the supplied metadata supports it.',
    `Candidate context:\n${JSON.stringify(candidateContext)}`,
  ].join('\n\n');
}

async function requestRankings(args: {
  client: OpenAI;
  model: string;
  canvas: CanvasDoc;
  regions: Map<string, ScreenSpec['regions'][number]>;
  batch: RegionCandidates[];
}): Promise<VisionRankingResponse['rankings']> {
  const content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail: 'low' }
  > = [{ type: 'input_text', text: rankingPrompt(args.batch, args.regions) }];
  for (const candidate of args.batch) {
    const region = args.regions.get(candidate.regionId);
    if (!region) continue;
    content.push({
      type: 'input_image',
      image_url: await renderComparisonSheet(args.canvas, region, candidate),
      detail: 'low',
    });
  }
  const response = await args.client.responses.create({
    model: args.model,
    input: [{ role: 'user', content }],
    text: {
      format: {
        type: 'json_schema',
        name: 'canvascraft_visual_rankings',
        description: 'Visual-fit rankings for the supplied wireframe regions and registry candidates.',
        strict: true,
        schema: VISION_RANKING_SCHEMA,
      },
    },
    max_output_tokens: Math.max(1_200, args.batch.length * 600),
    store: false,
  });
  if (response.status === 'incomplete') {
    throw new Error(`OpenAI visual ranking was incomplete: ${response.incomplete_details?.reason ?? 'unknown reason'}.`);
  }
  if (!response.output_text) throw new Error('OpenAI visual ranking did not contain structured output.');
  return VisionRankingResponse.parse(JSON.parse(response.output_text)).rankings;
}

export function applyOpenAiRankings(
  candidates: readonly RegionCandidates[],
  rankings: readonly VisionRankingResponse['rankings'][number][],
): RegionCandidates[] {
  const rankingByRegion = new Map<string, VisionRankingResponse['rankings'][number]>();
  for (const ranking of rankings) {
    if (rankingByRegion.has(ranking.regionId)) {
      throw new Error(`OpenAI returned duplicate visual rankings for "${ranking.regionId}".`);
    }
    rankingByRegion.set(ranking.regionId, ranking);
  }

  return candidates.map((candidate) => {
    if (candidate.matches.length === 0) return candidate;
    const ranking = rankingByRegion.get(candidate.regionId);
    if (!ranking) throw new Error(`OpenAI did not rank region "${candidate.regionId}".`);
    const expectedIds = candidate.matches.map((match) => match.recordId).sort();
    const returnedIds = ranking.matches.map((match) => match.recordId).sort();
    if (
      expectedIds.length !== returnedIds.length ||
      expectedIds.some((recordId, index) => recordId !== returnedIds[index])
    ) {
      throw new Error(`OpenAI returned an invalid candidate set for "${candidate.regionId}".`);
    }
    const scored = new Map(ranking.matches.map((match) => [match.recordId, match]));
    return {
      ...candidate,
      matches: candidate.matches
        .map((match) => {
          const scoredMatch = scored.get(match.recordId);
          if (!scoredMatch) throw new Error(`OpenAI omitted "${match.recordId}".`);
          return {
            ...match,
            score: Number(scoredMatch.score.toFixed(3)),
            matchSource: 'openai' as const,
            rationale: scoredMatch.rationale,
          };
        })
        .sort((left, right) => right.score - left.score),
    };
  });
}

export async function rankWithOpenAi(args: {
  credentials: NonNullable<IntegrationCredentials['ai']>;
  canvas: CanvasDoc;
  spec: ScreenSpec;
  candidates: RegionCandidates[];
}): Promise<RegionCandidates[]> {
  const rankable = args.candidates.filter((candidate) => candidate.matches.length > 0);
  if (rankable.length === 0) return args.candidates;

  const client = new OpenAI({
    apiKey: args.credentials.apiKey,
    baseURL: args.credentials.baseUrl,
    maxRetries: 1,
    timeout: 60_000,
  });
  const regions = new Map(args.spec.regions.map((region) => [region.id, region]));
  const rankingBatches = await Promise.all(
    chunk(rankable, RANKING_BATCH_SIZE).map((batch) =>
      requestRankings({
        client,
        model: args.credentials.visualRankerModel,
        canvas: args.canvas,
        regions,
        batch,
      }),
    ),
  );
  const ranked = applyOpenAiRankings(rankable, rankingBatches.flat());
  const rankedByRegion = new Map(ranked.map((candidate) => [candidate.regionId, candidate]));
  return args.candidates.map((candidate) => rankedByRegion.get(candidate.regionId) ?? candidate);
}
