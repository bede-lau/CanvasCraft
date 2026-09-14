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

/**
 * What the user is told when the orchestrator is not answering.
 *
 * A gateway between the browser and the orchestrator reports its own failure,
 * not the cause: the dev proxy answers `502 Bad Gateway`, and `fetch` answers
 * `Failed to fetch`. Neither names the process that is missing, so both were
 * relayed verbatim into a notice nobody could act on. Whichever shape the
 * failure arrives in, the fix is the same one sentence.
 */
const UNREACHABLE = `Could not reach the orchestrator${BASE_URL.startsWith('/') ? '' : ` at ${BASE_URL}`}. Start it with "pnpm dev:orchestrator", or "pnpm dev" from the repo root to run it alongside the web app.`;

/** True for the statuses a proxy or load balancer emits when nothing is listening upstream. */
function isGatewayStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(orchestratorUrl(path), {
      ...init,
      headers: {
        // A body-less request (every DELETE here) with this header set still
        // trips Fastify's JSON body parser — it expects a body once the
        // content-type says there is one, even an empty one.
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // A rejected fetch carries no status: the request never reached a server.
    throw new Error(UNREACHABLE);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; issues?: string[] } | null;
    const detail = payload?.issues?.join(' ') ?? payload?.error;
    if (detail) throw new Error(detail);
    // No JSON body means the response came from something in front of the
    // orchestrator rather than from the orchestrator itself.
    throw new Error(
      isGatewayStatus(response.status) ? UNREACHABLE : `${response.status} ${response.statusText}`,
    );
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

/** Event types the generation trace consumes; others (branch churn, gate
 *  decisions) are replayed in full after the run and don't need a live tail. */
const TRACE_EVENT_TYPES = [
  'run-started',
  'stage-started',
  'stage-finished',
  'run-finished',
  'run-failed',
] as const;

/**
 * Live tail of a run's event log. Each event is forwarded as the orchestrator
 * emits it, so the trace can advance stage by stage while `createRun` is still
 * working — rather than filling in all at once when it finally answers.
 *
 * The endpoint replays the whole backlog on every connect, so nothing is lost
 * by connecting late. `EventSource` does not reconnect after an HTTP error
 * (a 404 in the window before the run reaches disk counts as one), so this
 * re-opens on its own until the returned disposer is called.
 */
export function streamRunEvents(runId: string, onEvent: (event: RunEvent) => void): () => void {
  const url = orchestratorUrl(`/runs/${encodeURIComponent(runId)}/events`);
  let source: EventSource | null = null;
  let reopenTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const handle = (raw: MessageEvent<string>) => {
    const parsed = RunEvent.safeParse(JSON.parse(raw.data) as unknown);
    if (parsed.success) onEvent(parsed.data);
  };

  const open = () => {
    if (disposed) return;
    source = new EventSource(url);
    for (const type of TRACE_EVENT_TYPES) source.addEventListener(type, handle as EventListener);
    source.onerror = () => {
      source?.close();
      if (disposed) return;
      reopenTimer = setTimeout(open, 400);
    };
  };

  open();
  return () => {
    disposed = true;
    if (reopenTimer) clearTimeout(reopenTimer);
    source?.close();
  };
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

/** Deletes one applied patch, reverting the branch manifest it touched. */
export async function deleteServerPatch(runId: string, patchId: string): Promise<RunRecord> {
  const response = await request(
    `/runs/${encodeURIComponent(runId)}/patches/${encodeURIComponent(patchId)}`,
    { method: 'DELETE' },
  );
  return RunRecord.parse(await response.json());
}

export async function getRun(runId: string): Promise<RunRecord> {
  const response = await request(`/runs/${encodeURIComponent(runId)}`);
  return RunRecord.parse(await response.json());
}

export async function deleteServerBranch(runId: string, branchId: string): Promise<RunRecord> {
  const response = await request(
    `/runs/${encodeURIComponent(runId)}/branches/${encodeURIComponent(branchId)}`,
    { method: 'DELETE' },
  );
  return RunRecord.parse(await response.json());
}

/** Deletes a whole run — every branch and its live Daytona sandbox with it. */
export async function deleteServerRun(runId: string): Promise<void> {
  await request(`/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
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
