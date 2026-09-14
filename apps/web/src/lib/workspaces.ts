import { CanvasDoc, type CanvasDoc as CanvasDocType, type RunRecord } from '@canvascraft/schema';

/**
 * Local recall for drafts and for generated runs.
 *
 * There is no account system, so "workspaces" live in this browser's
 * localStorage — a flat list of `{ id, canvas, run? }` entries, keyed by a
 * workspace id that is generated once per in-progress draft (not the
 * canvas's own `id`, which a blank board and every "start from template"
 * click can otherwise collide on). Lightweight on purpose: no server round
 * trip, no schema migration story beyond what `CanvasDoc.safeParse` already
 * tolerates, and a corrupt or over-quota store degrades to "nothing saved"
 * rather than breaking the draft in progress.
 *
 * An entry with a `run` is a *generated* workspace: opening it reopens the
 * review page — the three directions and their running sandboxes — instead of
 * the drawing board. The `runId` is resolved against the orchestrator on open
 * (`GET /runs/:id`); the rest of `run` is denormalised here so the card can
 * render without a round trip and still reads sensibly when the orchestrator
 * is down.
 */

export interface WorkspaceRun {
  runId: string;
  savedAt: string;
  branchCount: number;
  championName: string | null;
  serving: boolean;
}

export interface WorkspaceEntry {
  id: string;
  canvas: CanvasDocType;
  run?: WorkspaceRun;
}

const STORAGE_KEY = 'canvascraft.workspaces.v1';
const MAX_WORKSPACES = 30;

function parseRun(value: unknown): WorkspaceRun | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.runId !== 'string' || !candidate.runId) return undefined;
  return {
    runId: candidate.runId,
    savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date(0).toISOString(),
    branchCount: typeof candidate.branchCount === 'number' ? candidate.branchCount : 0,
    championName: typeof candidate.championName === 'string' ? candidate.championName : null,
    serving: candidate.serving === true,
  };
}

function readAll(): WorkspaceEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: WorkspaceEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string') continue;
      const result = CanvasDoc.safeParse((item as { canvas?: unknown }).canvas);
      if (!result.success) continue;
      const entry: WorkspaceEntry = { id: (item as { id: string }).id, canvas: result.data };
      const run = parseRun((item as { run?: unknown }).run);
      if (run) entry.run = run;
      entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

function writeAll(entries: WorkspaceEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_WORKSPACES)));
  } catch {
    // Private browsing or a full quota — the draft keeps working, it just won't be recalled next time.
  }
}

/** A generated run recalls by when it was generated; a draft by its last edit. */
function recallStamp(entry: WorkspaceEntry): string {
  return entry.run?.savedAt ?? entry.canvas.updatedAt;
}

/** A blank board isn't a workspace worth recalling — only real intent is. */
export function isWorthSaving(doc: CanvasDocType): boolean {
  return doc.elements.length > 0 || doc.notes.length > 0 || doc.baseImage !== null;
}

export function listWorkspaces(): WorkspaceEntry[] {
  return readAll().sort((a, b) => recallStamp(b).localeCompare(recallStamp(a)));
}

export function saveWorkspace(id: string, doc: CanvasDocType): void {
  if (!isWorthSaving(doc)) return;
  writeAll([{ id, canvas: doc }, ...readAll().filter((entry) => entry.id !== id)]);
}

/**
 * Persist a completed run as its own workspace, keyed by the run id so
 * re-running the same canvas adds a fresh card rather than overwriting the
 * last. The source canvas rides along for the card thumbnail and title.
 */
export function saveRunWorkspace(run: RunRecord): void {
  const champion = run.branches.find((branch) => branch.id === run.championBranchId) ?? null;
  const entry: WorkspaceEntry = {
    id: `run:${run.id}`,
    canvas: run.canvas,
    run: {
      runId: run.id,
      savedAt: new Date().toISOString(),
      branchCount: run.branches.length,
      championName: champion?.name ?? null,
      serving: run.branches.some((branch) => branch.status === 'serving'),
    },
  };
  writeAll([entry, ...readAll().filter((existing) => existing.id !== entry.id)]);
}

export function deleteWorkspace(id: string): void {
  writeAll(readAll().filter((entry) => entry.id !== id));
}
