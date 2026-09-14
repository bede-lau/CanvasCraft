import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Daytona } from '@daytona/sdk';

import type { BranchRecord } from '@canvascraft/schema';

import type { MaterializedFile } from './branch-materializer.js';
import type { IntegrationCredentials } from './config.js';

export interface DaytonaLaunchResult {
  status: BranchRecord['status'];
  sandboxId: string | null;
  previewUrl: string | null;
  /** Server-only signed upstream preview capability. */
  previewToken: string | null;
  error: string | null;
  logTail: string[];
}

const BRANCH_TEMPLATE_ROOT = path.resolve(import.meta.dirname, '../../..', 'packages/branch-template');
const SKIPPED_TEMPLATE_DIRECTORIES = new Set(['.omc', 'dist', 'node_modules']);
const PREBAKED_WORKSPACE = '/workspace';
const SYSTEM_SNAPSHOT_WORKSPACE = '/home/daytona/canvascraft';

function usesSystemSnapshot(snapshot: string): boolean {
  return /^daytona-(?:small|medium|large|8cpu-16gb)$/.test(snapshot);
}

function workspaceForSnapshot(snapshot: string): string {
  return usesSystemSnapshot(snapshot) ? SYSTEM_SNAPSHOT_WORKSPACE : PREBAKED_WORKSPACE;
}

async function collectBranchStarterFiles(
  directory = BRANCH_TEMPLATE_ROOT,
  relativeDirectory = '',
): Promise<MaterializedFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: MaterializedFile[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_TEMPLATE_DIRECTORIES.has(entry.name)) continue;
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectBranchStarterFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ path: relativePath, contents: await readFile(absolutePath, 'utf8') });
    }
  }

  return files;
}

export class DaytonaBranchManager {
  private readonly client: Daytona;

  /**
   * Sandboxes this manager has already handed to a branch.
   *
   * One manager serves one run, and a run launches its branches one after
   * another. Without this, a sandbox claimed for branch 1 could be claimed
   * again for branch 2 — every branch would then upload its generated modules
   * over the previous branch's files in the same workspace and every preview
   * would serve whichever branch built last.
   */
  private readonly claimedSandboxIds = new Set<string>();

  /**
   * Serialises {@link claimIdleSandbox} calls so branches launched
   * concurrently (see `app.ts`'s `Promise.all` over `manager.launch`) cannot
   * both list the same "stopped" sandbox before either has marked it
   * claimed. The check-then-add in `claimIdleSandbox` is only atomic within
   * one call; across calls it needs this queue.
   */
  private claimQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: NonNullable<IntegrationCredentials['daytona']>) {
    this.client = new Daytona({
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      target: config.target,
      requestTimeoutMs: 90_000,
    });
  }

  /**
   * Claims an idle sandbox this app previously created instead of paying for
   * a fresh one. Disk quota is billed per sandbox, so reusing one that is
   * merely stopped (not deleted) is the difference between "still counts
   * against quota" and "counts against quota AND creates another".
   *
   * Scoped to this exact snapshot via the `snapshot` label — an unrelated
   * layout would make the workspace-path convention and any leftover files
   * wrong. Relabels immediately with the new runId/branchId so a concurrent
   * launch won't also claim it; this is a best-effort claim (no server-side
   * lock), acceptable for single-operator local development.
   *
   * Only `stopped` sandboxes are eligible. A `started` one is either serving a
   * branch right now or is mid-launch, and every branch needs its own workspace
   * — two branches sharing one sandbox means one bundle for both. `claimedSandboxIds`
   * is the second guard, because the listing reflects state a moment ago and a
   * sandbox this run just started can still come back as `stopped`.
   */
  private async claimIdleSandbox(runId: string, branchId: string): Promise<string | null> {
    const attempt = this.claimQueue.then(async () => {
      const candidates = this.client.list({
        labels: { app: 'canvascraft', snapshot: this.config.snapshot },
        states: ['stopped'],
      });
      for await (const sandbox of candidates) {
        if (this.claimedSandboxIds.has(sandbox.id)) continue;
        this.claimedSandboxIds.add(sandbox.id);
        await sandbox.setLabels({ app: 'canvascraft', snapshot: this.config.snapshot, runId, branchId });
        await sandbox.start(120);
        return sandbox.id;
      }
      return null;
    });
    // Chain the queue to a form that never rejects: a failed claim must not
    // wedge every later branch's claim behind a broken promise.
    this.claimQueue = attempt.catch(() => null);
    return attempt;
  }

  /**
   * Stops sandboxes this app started that no persisted branch points at any more.
   *
   * A run that crashes between starting a sandbox and writing its branch record
   * leaves the sandbox running and billing, and nothing will ever reclaim it:
   * `claimIdleSandbox` only takes `stopped` ones, on purpose. This is what
   * closes that leak.
   *
   * Reachability, not age or run status, is the test. A preview can only be
   * opened through a branch record's stored capability, so a sandbox that no
   * branch names cannot be showing anything to anyone — whereas a *finished*
   * run's sandboxes are exactly what the user reviews afterwards and must not
   * be touched. Stopping (not deleting) also keeps the work recoverable: a
   * stopped sandbox is what the next run will reuse.
   *
   * @param liveSandboxIds every sandbox id named by a persisted branch. The
   *   caller must be certain this is complete; a partial set would read live
   *   sandboxes as orphans.
   */
  async stopOrphanedSandboxes(args: {
    liveSandboxIds: ReadonlySet<string>;
    activeRunId: string;
  }): Promise<string[]> {
    const stopped: string[] = [];
    const candidates = this.client.list({
      labels: { app: 'canvascraft', snapshot: this.config.snapshot },
      states: ['started'],
    });
    for await (const sandbox of candidates) {
      // Anything this run owns is excluded twice over: its branch record may not
      // be written yet, so neither the live set nor the labels can be trusted
      // alone.
      if (this.claimedSandboxIds.has(sandbox.id)) continue;
      if (args.liveSandboxIds.has(sandbox.id)) continue;
      const runId = sandbox.labels?.runId;
      if (!runId || runId === args.activeRunId) continue;
      try {
        await sandbox.stop(60);
        stopped.push(sandbox.id);
      } catch {
        // Best effort: a sandbox that will not stop is a cost problem, not a
        // reason to fail the run that found it.
      }
    }
    return stopped;
  }

  async launch(args: {
    runId: string;
    branch: BranchRecord;
    files: readonly MaterializedFile[];
  }): Promise<DaytonaLaunchResult> {
    let sandboxId: string | null = null;
    const logs: string[] = [];
    try {
      const bootstrapStarter = usesSystemSnapshot(this.config.snapshot);
      const workspace = workspaceForSnapshot(this.config.snapshot);
      const reusedId = await this.claimIdleSandbox(args.runId, args.branch.id);
      const sandbox = reusedId
        ? await this.client.get(reusedId)
        : await this.client.create(
            {
              snapshot: this.config.snapshot,
              language: 'typescript',
              public: false,
              autoStopInterval: this.config.autoStopMinutes,
              labels: {
                app: 'canvascraft',
                snapshot: this.config.snapshot,
                runId: args.runId,
                branchId: args.branch.id,
              },
              // System snapshots need temporary package-registry access for npm ci.
              networkBlockAll: !bootstrapStarter,
            },
            { timeout: 120 },
          );
      sandboxId = sandbox.id;
      // Freshly created sandboxes are recorded too, so nothing this run owns can
      // be reclaimed for a later branch.
      this.claimedSandboxIds.add(sandbox.id);
      if (reusedId) logs.push(`Reused idle sandbox ${reusedId} instead of creating a new one.`);
      if (bootstrapStarter) await sandbox.fs.createFolder(workspace, '755');
      const uploadFiles = new Map<string, MaterializedFile>();
      if (bootstrapStarter) {
        for (const file of await collectBranchStarterFiles()) uploadFiles.set(file.path, file);
        logs.push('System snapshot fallback: uploaded the CanvasCraft branch starter and will run npm ci.');
      }
      for (const file of args.files) uploadFiles.set(file.path, file);

      await Promise.all(
        Array.from(uploadFiles.values()).map((file) =>
          sandbox.fs.uploadFile(Buffer.from(file.contents), `${workspace}/${file.path}`),
        ),
      );
      const command = [
        // A reused sandbox's disk survives stop/start, so `node_modules` from
        // an earlier branch's install is very likely still there — `npm ci`
        // always wipes and reinstalls from scratch regardless, so skipping it
        // when the directory already exists turns every reuse after the first
        // cold install on a given sandbox into a no-op here instead of a full
        // dependency install.
        ...(bootstrapStarter ? ['([ -d node_modules ] || npm ci --ignore-scripts --prefer-offline --no-audit --no-fund)'] : []),
        'npm run build',
        `(nohup npm run preview -- --host 0.0.0.0 --port ${this.config.previewPort} > /tmp/canvascraft-vite.log 2>&1 &)`,
        'sleep 2',
        'cat /tmp/canvascraft-vite.log',
        `curl --fail --silent http://127.0.0.1:${this.config.previewPort}/ > /dev/null`,
      ].join(' && ');
      const boot = await sandbox.process.executeCommand(command, workspace, undefined, 90);
      logs.push(...(boot.result ?? '').split(/\r?\n/).filter(Boolean).slice(-12));
      if (boot.exitCode !== 0) throw new Error(`Vite server exited with ${boot.exitCode}.`);
      const preview = await sandbox.getSignedPreviewUrl(this.config.previewPort, 3_600);
      return {
        status: 'serving',
        sandboxId,
        previewUrl: null,
        previewToken: preview.url,
        error: null,
        logTail: logs,
      };
    } catch (error) {
      return {
        status: 'failed',
        sandboxId,
        previewUrl: null,
        previewToken: null,
        error: error instanceof Error ? error.message : 'Daytona launch failed.',
        logTail: logs,
      };
    }
  }

  async stopAndArchive(sandboxId: string): Promise<void> {
    const sandbox = await this.client.get(sandboxId);
    await sandbox.stop(60);
    await sandbox.archive();
  }

  /**
   * Permanently deletes a sandbox — used when the workspace that owns it is
   * deleted outright, not just one branch retired from a live run. Unlike
   * {@link stopAndArchive} this is not recoverable, which matches "delete the
   * workspace" deleting its sandboxes rather than merely retiring them.
   *
   * Already gone is treated as done, not failed: the caller wants the
   * sandbox gone, and a sandbox Daytona can no longer find satisfies that.
   */
  async deleteSandbox(sandboxId: string): Promise<void> {
    let sandbox: Awaited<ReturnType<Daytona['get']>>;
    try {
      sandbox = await this.client.get(sandboxId);
    } catch {
      return;
    }
    await sandbox.delete(60);
  }

  /**
   * Uploads regenerated modules and rebuilds so the change is actually visible.
   *
   * The preview server serves the static `dist/` produced at launch, so an
   * upload on its own leaves the running branch showing pre-patch output. The
   * rebuild replaces `dist/` in place; `vite preview` reads from disk per
   * request, so it picks the new bundle up without a restart.
   */
  async syncGeneratedModules(
    sandboxId: string,
    files: readonly MaterializedFile[],
  ): Promise<string[]> {
    const sandbox = await this.client.get(sandboxId);
    const workspace = workspaceForSnapshot(this.config.snapshot);
    for (const file of files) {
      await sandbox.fs.uploadFile(Buffer.from(file.contents), `${workspace}/${file.path}`);
    }
    const rebuild = await sandbox.process.executeCommand('npm run build', workspace, undefined, 120);
    const logTail = (rebuild.result ?? '').split(/\r?\n/).filter(Boolean).slice(-12);
    if (rebuild.exitCode !== 0) {
      throw new Error(
        `Rebuilding the live branch failed with exit code ${rebuild.exitCode}. ${logTail.join(' ')}`.trim(),
      );
    }
    return logTail;
  }
}
