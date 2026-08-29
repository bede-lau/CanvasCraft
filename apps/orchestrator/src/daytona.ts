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

  constructor(private readonly config: NonNullable<IntegrationCredentials['daytona']>) {
    this.client = new Daytona({
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      target: config.target,
      requestTimeoutMs: 90_000,
    });
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
      const sandbox = await this.client.create(
        {
          snapshot: this.config.snapshot,
          language: 'typescript',
          public: false,
          autoStopInterval: this.config.autoStopMinutes,
          labels: {
            app: 'canvascraft',
            runId: args.runId,
            branchId: args.branch.id,
          },
          // System snapshots need temporary package-registry access for npm ci.
          networkBlockAll: !bootstrapStarter,
        },
        { timeout: 120 },
      );
      sandboxId = sandbox.id;
      if (bootstrapStarter) await sandbox.fs.createFolder(workspace, '755');
      const uploadFiles = new Map<string, MaterializedFile>();
      if (bootstrapStarter) {
        for (const file of await collectBranchStarterFiles()) uploadFiles.set(file.path, file);
        logs.push('System snapshot fallback: uploaded the CanvasCraft branch starter and will run npm ci.');
      }
      for (const file of args.files) uploadFiles.set(file.path, file);

      for (const file of uploadFiles.values()) {
        await sandbox.fs.uploadFile(Buffer.from(file.contents), `${workspace}/${file.path}`);
      }
      const command = [
        ...(bootstrapStarter ? ['npm ci --ignore-scripts'] : []),
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

  async syncGeneratedModules(
    sandboxId: string,
    files: readonly MaterializedFile[],
  ): Promise<void> {
    const sandbox = await this.client.get(sandboxId);
    const workspace = workspaceForSnapshot(this.config.snapshot);
    for (const file of files) {
      await sandbox.fs.uploadFile(Buffer.from(file.contents), `${workspace}/${file.path}`);
    }
  }
}
