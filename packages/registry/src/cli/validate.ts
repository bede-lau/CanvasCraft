import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { REGISTRY_RECORDS } from '../catalogue.js';
import { validateRegistry } from '../gate.js';

const issues = validateRegistry();
const packageRoot = resolve(import.meta.dirname, '../..');

for (const record of REGISTRY_RECORDS) {
  if (!existsSync(resolve(packageRoot, record.thumbnail))) {
    issues.push(`${record.id}: thumbnail is missing at ${record.thumbnail}. Run "pnpm registry:thumbnails".`);
  }
}

if (issues.length > 0) {
  console.error('CanvasCraft registry validation failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log('CanvasCraft registry is valid.');
}
