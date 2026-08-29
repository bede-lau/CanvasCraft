import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';

const root = resolve(import.meta.dirname, '..');
loadEnvironment({ path: resolve(root, '.env'), quiet: true });
const expectedFiles = [
  'apps/web/package.json',
  'apps/orchestrator/package.json',
  'packages/schema/src/index.ts',
  'packages/registry/src/index.ts',
  'packages/branch-template/src/main.tsx',
  'services/nosana-clip/main.py',
  'infra/daytona-snapshot/Dockerfile',
];

const issues = [];
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) issues.push(`Node ${process.version} is too old; CanvasCraft requires Node 20.19 or newer.`);

for (const relativePath of expectedFiles) {
  try {
    await access(resolve(root, relativePath));
  } catch {
    issues.push(`Missing required project file: ${relativePath}`);
  }
}

for (const [integration, variables] of [
  ['OpenAI generation', ['OPENAI_API_KEY']],
  ['Nosana matching', ['NOSANA_ENDPOINT']],
  ['Daytona live branches', ['DAYTONA_API_KEY', 'DAYTONA_SNAPSHOT']],
]) {
  const missing = variables.filter((variable) => !process.env[variable]);
  if (missing.length > 0) {
    console.log(`Optional ${integration} is not configured (${missing.join(', ')}). Offline-first mode remains available.`);
  }
}

if (issues.length > 0) {
  console.error('CanvasCraft preflight failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`CanvasCraft preflight passed on Node ${process.version}.`);
}
