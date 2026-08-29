import type { ScreenSpec, VariantManifest } from '@canvascraft/schema';

export interface MaterializedFile {
  path: string;
  contents: string;
}

const FORBIDDEN_SOURCE = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\baxios\b/,
  /\bprocess\.env\b/,
  /\bexpress\b/,
  /\bprisma\b/,
  /\bsupabase\b/,
];

function typeModule(name: 'ScreenSpec' | 'VariantManifest'): string {
  return `import type { ${name} } from '../runtime/types';\n`;
}

export function materializeBranch(
  spec: ScreenSpec,
  manifest: VariantManifest,
): MaterializedFile[] {
  const files: MaterializedFile[] = [
    {
      path: 'src/generated/screen-spec.ts',
      contents: `${typeModule('ScreenSpec')}\nexport const SCREEN_SPEC: ScreenSpec = ${JSON.stringify(spec, null, 2)};\n`,
    },
    {
      path: 'src/generated/variant-manifest.ts',
      contents: `${typeModule('VariantManifest')}\nexport const VARIANT_MANIFEST: VariantManifest = ${JSON.stringify(manifest, null, 2)};\n`,
    },
  ];
  const issues = validateMaterializedBranch(files);
  if (issues.length > 0) throw new Error(`Generated branch guardrail failure: ${issues.join(' ')}`);
  return files;
}

export function validateMaterializedBranch(files: readonly MaterializedFile[]): string[] {
  const issues: string[] = [];
  const expected = new Set([
    'src/generated/screen-spec.ts',
    'src/generated/variant-manifest.ts',
  ]);
  if (files.length !== expected.size) issues.push('Generated branches may only replace the two typed generated modules.');

  for (const file of files) {
    if (!expected.delete(file.path)) issues.push(`Unexpected generated file "${file.path}".`);
    if (file.path.includes('..') || file.path.startsWith('/')) issues.push(`Unsafe generated path "${file.path}".`);
    if (file.contents.length > 500_000) issues.push(`Generated file "${file.path}" is too large.`);
    for (const pattern of FORBIDDEN_SOURCE) {
      if (pattern.test(file.contents)) {
        issues.push(`Generated file "${file.path}" contains forbidden runtime behavior (${pattern}).`);
      }
    }
  }
  for (const missing of expected) issues.push(`Missing required generated file "${missing}".`);
  return issues;
}
