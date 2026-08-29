import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const packagePath = resolve(root, 'packages/branch-template/package.json');
const dockerfilePath = resolve(root, 'infra/daytona-snapshot/Dockerfile');
const packageContents = await readFile(packagePath);
const tag = `canvascraft-vite-starter:${createHash('sha256').update(packageContents).digest('hex').slice(0, 12)}`;
const image = process.env.DAYTONA_SNAPSHOT_IMAGE ?? tag;

console.log(`Building Daytona snapshot image ${image}`);
const result = spawnSync(
  'docker',
  ['build', '--file', dockerfilePath, '--tag', image, root],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(`Docker could not start: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  console.log(`Built ${image}. Register this image as a Daytona Snapshot before configuring DAYTONA_SNAPSHOT.`);
}
