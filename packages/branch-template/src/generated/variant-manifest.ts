import type { VariantManifest } from '../runtime/types';
import { SCREEN_SPEC } from './screen-spec';

/**
 * This module is replaced per generated branch. It contains treatment only:
 * no layout, content, state, or interaction decisions live here.
 */
export const VARIANT_MANIFEST: VariantManifest = {
  version: 1,
  id: 'branch-calm',
  name: 'Calm Trust',
  genome: 'Mineral palette / soft controls / calm motion',
  rationale: 'Reduce cognitive noise so portfolio risk reads as measured and credible.',
  palette: {
    name: 'Mineral',
    background: '#f4f6f3',
    surface: '#ffffff',
    surfaceRaised: '#f9faf8',
    border: '#d9dfd8',
    textPrimary: '#16201a',
    textSecondary: '#637067',
    accent: '#27634a',
    accentContrast: '#ffffff',
    positive: '#347856',
    critical: '#9b4f49',
    scheme: 'light',
  },
  typography: {
    displayFamily: 'ui-rounded, "Avenir Next", "Segoe UI", sans-serif',
    bodyFamily: 'Inter, "Segoe UI", sans-serif',
    monoFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    scaleRatio: 1.2,
    baseSizePx: 15,
    displayWeight: 650,
    bodyWeight: 430,
    displayTrackingEm: 0,
    bodyLeading: 1.5,
  },
  form: {
    spaceUnitPx: 4,
    density: 'roomy',
    radiusOuterPx: 16,
    radiusStepPx: 4,
    borderWidthPx: 1,
    elevation: 'hairline',
  },
  controls: {
    buttonShape: 'soft',
    buttonFill: 'solid',
    inputStyle: 'outlined',
    iconWeight: 'regular',
    iconSizePx: 18,
    focusRing: 'ring',
  },
  motion: {
    preset: 'calm',
    durationMs: 260,
    easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    staggerMs: 40,
    travel: 0.25,
    reducedMotion: 'fade-only',
  },
  selections: SCREEN_SPEC.regions.map((region) => ({
    regionId: region.id,
    recordId: region.id === 'insight-deck' ? 'react-bits-card-swap' : 'canvascraft-neutral',
    source: region.id === 'insight-deck' ? 'react-bits' : 'canvascraft',
    sourceUrl:
      region.id === 'insight-deck'
        ? 'https://reactbits.dev/components/card-swap'
        : 'https://canvascraft.local/patterns',
    license: region.id === 'insight-deck' ? 'mit-commons-clause' : 'canvascraft-original',
    licenseNotice:
      region.id === 'insight-deck'
        ? 'React Bits MIT and Commons Clause notice retained in the preview source.'
        : null,
    matchScore: region.id === 'insight-deck' ? 0.91 : 0.82,
    matchSource: 'local',
    whyItFits: `${region.label} maps to the shared ${region.role} contract without changing behavior.`,
    fallbackReason: null,
  })),
  lineage: {
    specId: SCREEN_SPEC.id,
    specHash: '4df1e2c7b29e0c3de9801527c36562e9c52ce49b0ad2ffae421ce78fbcdd78d0',
    parentBranchIds: [],
    traitOrigins: {
      palette: null,
      typography: null,
      form: null,
      controls: null,
      motion: null,
      selections: null,
    },
    registryVersion: '0.1.0',
  },
  createdAt: '2026-08-29T09:00:00.000+08:00',
};
