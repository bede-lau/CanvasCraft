import {
  BranchRecord,
  PatchInstruction,
  RunEvent,
  RunRecord,
  type ApplyRecommendationRequest,
  type GenerateRequest,
  type RemixRequest,
  type SelectChampionRequest,
} from '@canvascraft/schema';

const configuredBaseUrl = (import.meta.env.VITE_ORCHESTRATOR_URL as string | undefined)?.replace(/\/$/, '');
const BASE_URL = configuredBaseUrl ?? (import.meta.env.DEV ? '/api' : 'http://127.0.0.1:8787');

export function orchestratorUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(orchestratorUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; issues?: string[] } | null;
    const detail = payload?.issues?.join(' ') ?? payload?.error ?? `${response.status} ${response.statusText}`;
    throw new Error(detail);
  }
  return response;
}

export async function createRun(body: GenerateRequest): Promise<RunRecord> {
  const response = await request('/runs', { method: 'POST', body: JSON.stringify(body) });
  return RunRecord.parse(await response.json());
}

export async function replayRunEvents(runId: string): Promise<RunEvent[]> {
  const response = await request(`/runs/${encodeURIComponent(runId)}/events?replayOnly=true`, {
    headers: { Accept: 'text/event-stream' },
  });
  const stream = await response.text();
  return stream
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => RunEvent.parse(JSON.parse(line.slice(6))));
}

export async function setRecommendation(
  runId: string,
  body: ApplyRecommendationRequest,
): Promise<RunRecord> {
  const response = await request(`/runs/${encodeURIComponent(runId)}/recommendations`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return RunRecord.parse(await response.json());
}

export async function createServerRemix(runId: string, body: RemixRequest): Promise<BranchRecord> {
  const response = await request(`/runs/${encodeURIComponent(runId)}/remixes`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return BranchRecord.parse(await response.json());
}

export async function createServerPatch(
  runId: string,
  body: { branchId: string; regionId: string; request: string },
): Promise<PatchInstruction> {
  const response = await request(`/runs/${encodeURIComponent(runId)}/patches`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return PatchInstruction.parse(await response.json());
}

export async function getRun(runId: string): Promise<RunRecord> {
  const response = await request(`/runs/${encodeURIComponent(runId)}`);
  return RunRecord.parse(await response.json());
}

export async function setChampion(
  runId: string,
  body: SelectChampionRequest,
): Promise<RunRecord> {
  const response = await request(`/runs/${encodeURIComponent(runId)}/champion`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return RunRecord.parse(await response.json());
}
