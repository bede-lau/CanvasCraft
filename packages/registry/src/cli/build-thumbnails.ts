import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { REGISTRY_RECORDS } from '../catalogue.js';

const paletteBySource = {
  canvascraft: ['#14161c', '#f0b860'],
  'react-bits': ['#2b193d', '#ecb8ff'],
  'beautiful-ui': ['#152b33', '#89e2c0'],
  'coss-ui': ['#2b2419', '#f4cf81'],
  reui: ['#20233a', '#bfc8ff'],
} as const;

function makeThumbnail(name: string, source: keyof typeof paletteBySource, index: number): string {
  const [background, accent] = paletteBySource[source];
  const offset = 18 + (index % 4) * 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300" role="img" aria-label="${name}">
  <rect width="480" height="300" fill="${background}"/>
  <rect x="28" y="28" width="424" height="244" rx="18" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".18"/>
  <rect x="54" y="58" width="156" height="14" rx="7" fill="${accent}" fill-opacity=".92"/>
  <rect x="54" y="90" width="260" height="8" rx="4" fill="#ffffff" fill-opacity=".4"/>
  <rect x="54" y="116" width="358" height="8" rx="4" fill="#ffffff" fill-opacity=".22"/>
  <rect x="${54 + offset}" y="158" width="118" height="82" rx="12" fill="${accent}" fill-opacity=".24"/>
  <rect x="${190 + offset}" y="158" width="118" height="82" rx="12" fill="#ffffff" fill-opacity=".12"/>
  <rect x="${326 - offset / 2}" y="158" width="86" height="82" rx="12" fill="#ffffff" fill-opacity=".08"/>
  <text x="54" y="258" fill="#ffffff" fill-opacity=".8" font-family="Arial, sans-serif" font-size="16">${name}</text>
</svg>
`;
}

const targetDirectory = resolve(import.meta.dirname, '../../data/thumbnails');
await mkdir(targetDirectory, { recursive: true });

await Promise.all(
  REGISTRY_RECORDS.map((record, index) =>
    writeFile(
      resolve(targetDirectory, `${record.id}.svg`),
      makeThumbnail(record.name, record.source, index),
      'utf8',
    ),
  ),
);

console.log(`Wrote ${REGISTRY_RECORDS.length} curated registry thumbnails to ${targetDirectory}`);
