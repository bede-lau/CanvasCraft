import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { REGISTRY_MANIFEST, REGISTRY_RECORDS } from '../catalogue.js';

function demoVector(id: string): number[] {
  const vector = Array.from({ length: 24 }, () => 0);
  for (let index = 0; index < id.length; index += 1) {
    vector[index % vector.length]! += id.charCodeAt(index) / 255;
  }
  const magnitude = Math.hypot(...vector);
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

const target = resolve(import.meta.dirname, '../../data/embeddings.json');
const index = {
  model: 'canvascraft-demo-semantic-index-v1',
  dimensions: 24,
  createdAt: new Date().toISOString(),
  registryVersion: REGISTRY_MANIFEST.version,
  vectors: Object.fromEntries(REGISTRY_RECORDS.map((record) => [record.id, demoVector(record.id)])),
};

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Wrote ${REGISTRY_RECORDS.length} local demo vectors to ${target}`);
