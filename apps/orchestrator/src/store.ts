import { mkdir, readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

import {
  RunEvent,
  RunRecord,
  findCanvasIntegrityIssues,
  findManifestIntegrityIssues,
  findSpecIntegrityIssues,
  type RunEvent as RunEventType,
  type RunRecord as RunRecordType,
} from '@canvascraft/schema';

import type { MaterializedFile } from './branch-materializer.js';

function sequenceName(sequence: number): string {
  return `${String(sequence).padStart(8, '0')}.json`;
}

export class RunStore {
  readonly runsDir: string;

  constructor(dataDir: string) {
    this.runsDir = path.join(dataDir, 'runs');
  }

  async initialise(): Promise<void> {
    await mkdir(this.runsDir, { recursive: true });
  }

  runDir(runId: string): string {
    return path.join(this.runsDir, runId);
  }

  async createRun(run: RunRecordType, canvasImage: string | null): Promise<void> {
    this.assertPersistable(run);
    const runDir = this.runDir(run.id);
    await mkdir(path.join(runDir, 'snapshots'), { recursive: true });
    await mkdir(path.join(runDir, 'branches'), { recursive: true });
    await writeFile(path.join(runDir, 'canvas.json'), `${JSON.stringify(run.canvas, null, 2)}\n`, { flag: 'wx' });
    if (canvasImage?.startsWith('data:image/png;base64,')) {
      await writeFile(path.join(runDir, 'canvas.png'), Buffer.from(canvasImage.slice('data:image/png;base64,'.length), 'base64'), {
        flag: 'wx',
      });
    }
    await this.appendSnapshot(run);
  }

  async appendSnapshot(run: RunRecordType): Promise<void> {
    this.assertPersistable(run);
    const snapshotsDir = path.join(this.runDir(run.id), 'snapshots');
    await mkdir(snapshotsDir, { recursive: true });
    const names = (await readdir(snapshotsDir)).filter((name) => /^\d{8}\.json$/.test(name)).sort();
    const sequence = names.length + 1;
    await writeFile(path.join(snapshotsDir, sequenceName(sequence)), `${JSON.stringify(RunRecord.parse(run), null, 2)}\n`, {
      flag: 'wx',
    });
  }

  async writeInitialArtifacts(run: RunRecordType): Promise<void> {
    this.assertPersistable(run);
    if (!run.spec) throw new Error('Cannot persist branch artifacts without a Screen Spec.');
    const runDir = this.runDir(run.id);
    await writeFile(path.join(runDir, 'screen-spec.json'), `${JSON.stringify(run.spec, null, 2)}\n`, { flag: 'wx' });
    for (const branch of run.branches) {
      const branchDir = path.join(runDir, 'branches', branch.id);
      await mkdir(branchDir, { recursive: true });
      await writeFile(path.join(branchDir, 'manifest.json'), `${JSON.stringify(branch.manifest, null, 2)}\n`, { flag: 'wx' });
    }
  }

  async appendManifestRevision(run: RunRecordType, branchId: string): Promise<void> {
    this.assertPersistable(run);
    const branch = run.branches.find((entry) => entry.id === branchId);
    if (!branch) throw new Error(`Cannot persist a manifest revision for unknown branch "${branchId}".`);
    const revisionsDir = path.join(this.runDir(run.id), 'branches', branchId, 'manifest-revisions');
    await mkdir(revisionsDir, { recursive: true });
    const names = (await readdir(revisionsDir)).filter((name) => /^\d{8}\.json$/.test(name)).sort();
    await writeFile(path.join(revisionsDir, sequenceName(names.length + 1)), `${JSON.stringify(branch.manifest, null, 2)}\n`, {
      flag: 'wx',
    });
  }

  async writeBranchFiles(
    runId: string,
    branchId: string,
    files: readonly MaterializedFile[],
  ): Promise<void> {
    const filesDir = path.resolve(this.runDir(runId), 'branches', branchId, 'files');
    for (const file of files) {
      const target = path.resolve(filesDir, file.path);
      if (!target.startsWith(`${filesDir}${path.sep}`)) {
        throw new Error(`Refused unsafe generated branch path "${file.path}".`);
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.contents, 'utf8');
    }
  }

  private assertPersistable(run: RunRecordType): void {
    const canvasIssues = findCanvasIntegrityIssues(run.canvas);
    if (canvasIssues.length > 0) throw new Error(`Canvas failed persistence integrity checks: ${canvasIssues.join(' ')}`);
    if (!run.spec) {
      if (run.specHash !== null || run.branches.length > 0) {
        throw new Error('A run without a Screen Spec cannot persist a spec hash or branches.');
      }
      return;
    }

    const specIssues = findSpecIntegrityIssues(run.spec);
    if (specIssues.length > 0) throw new Error(`Screen Spec failed persistence integrity checks: ${specIssues.join(' ')}`);
    if (!run.specHash) throw new Error('A persisted Screen Spec requires its canonical hash.');
    for (const branch of run.branches) {
      const manifestIssues = findManifestIntegrityIssues(branch.manifest, run.spec, run.specHash);
      if (manifestIssues.length > 0) {
        throw new Error(`Manifest failed persistence integrity checks: ${manifestIssues.join(' ')}`);
      }
    }
  }

  async appendEvent(event: RunEventType): Promise<void> {
    const parsed = RunEvent.parse(event);
    await appendFile(path.join(this.runDir(parsed.runId), 'events.ndjson'), `${JSON.stringify(parsed)}\n`, 'utf8');
  }

  async appendMutation(runId: string, mutation: unknown): Promise<void> {
    await appendFile(path.join(this.runDir(runId), 'mutations.ndjson'), `${JSON.stringify(mutation)}\n`, 'utf8');
  }

  async readRun(runId: string): Promise<RunRecordType | null> {
    try {
      const snapshotsDir = path.join(this.runDir(runId), 'snapshots');
      const names = (await readdir(snapshotsDir)).filter((name) => /^\d{8}\.json$/.test(name)).sort();
      const latest = names.at(-1);
      if (!latest) return null;
      return RunRecord.parse(JSON.parse(await readFile(path.join(snapshotsDir, latest), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async readEvents(runId: string): Promise<RunEventType[]> {
    try {
      const contents = await readFile(path.join(this.runDir(runId), 'events.ndjson'), 'utf8');
      return contents
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => RunEvent.parse(JSON.parse(line)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async readMutations(runId: string): Promise<unknown[]> {
    try {
      const contents = await readFile(path.join(this.runDir(runId), 'mutations.ndjson'), 'utf8');
      return contents
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}
