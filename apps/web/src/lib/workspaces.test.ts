import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunRecord } from '@canvascraft/schema';
import { DEFAULT_CANVAS } from './demo';
import {
  deleteWorkspace,
  listWorkspaces,
  saveRunWorkspace,
  saveWorkspace,
  type WorkspaceEntry,
} from './workspaces';

/**
 * The store reads and writes `window.localStorage` directly. Vitest runs this
 * package in the node environment, so stand up a minimal in-memory shim rather
 * than pull in jsdom for one contract.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
    localStorage: new MemoryStorage(),
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

/** Minimal run: `saveRunWorkspace` only reads id / canvas / branches / champion. */
function fakeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'run-123',
    canvas: DEFAULT_CANVAS,
    championBranchId: 'branch-b',
    branches: [
      { id: 'branch-a', name: 'Calm Momentum', status: 'archived' },
      { id: 'branch-b', name: 'Editorial Weight', status: 'serving' },
      { id: 'branch-c', name: 'Playful Depth', status: 'serving' },
    ],
    ...overrides,
  } as unknown as RunRecord;
}

describe('run workspaces', () => {
  it('round-trips a generated run as its own recallable entry', () => {
    saveRunWorkspace(fakeRun());

    const [entry] = listWorkspaces();
    expect(entry?.id).toBe('run:run-123');
    expect(entry?.run).toMatchObject({
      runId: 'run-123',
      branchCount: 3,
      championName: 'Editorial Weight',
      serving: true,
    });
    expect(entry?.canvas.title).toBe(DEFAULT_CANVAS.title);
  });

  it('marks a run whose branches are all stopped as not serving', () => {
    saveRunWorkspace(
      fakeRun({
        championBranchId: 'branch-a',
        branches: [{ id: 'branch-a', name: 'Calm Momentum', status: 'stopped' }],
      } as Partial<RunRecord>),
    );

    expect(listWorkspaces()[0]?.run?.serving).toBe(false);
  });

  it('re-running the same canvas adds a card per run, keyed by run id', () => {
    saveRunWorkspace(fakeRun({ id: 'run-1' }));
    saveRunWorkspace(fakeRun({ id: 'run-2' }));

    expect(listWorkspaces().map((entry) => entry.id)).toEqual(['run:run-2', 'run:run-1']);
  });

  it('sorts generated runs by when they were generated, ahead of older drafts', () => {
    saveWorkspace('draft-1', { ...DEFAULT_CANVAS, updatedAt: '2000-01-01T00:00:00.000Z' });
    saveRunWorkspace(fakeRun({ id: 'run-x' }));

    expect(listWorkspaces()[0]?.id).toBe('run:run-x');
  });

  it('keeps legacy draft-only entries readable and drops a malformed run field', () => {
    window.localStorage.setItem(
      'canvascraft.workspaces.v1',
      JSON.stringify([
        { id: 'legacy', canvas: DEFAULT_CANVAS },
        { id: 'bad-run', canvas: DEFAULT_CANVAS, run: { savedAt: 'x' } },
      ]),
    );

    const entries = listWorkspaces();
    const ids = entries.map((entry) => entry.id);
    expect(ids).toContain('legacy');
    expect(ids).toContain('bad-run');
    expect(entries.every((entry: WorkspaceEntry) => entry.run === undefined)).toBe(true);
  });

  it('deletes a generated workspace by its prefixed id', () => {
    saveRunWorkspace(fakeRun({ id: 'run-del' }));
    deleteWorkspace('run:run-del');
    expect(listWorkspaces()).toHaveLength(0);
  });
});
