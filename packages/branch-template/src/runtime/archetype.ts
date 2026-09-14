import type { LayoutRegion, PageArchetype, SemanticRole } from './types';

/**
 * What an archetype makes the page *be*.
 *
 * The Screen Spec fixes which regions exist, where they sit, and what they do.
 * It deliberately says nothing about how a page of that shape should be
 * composed, because that is a treatment decision — and treating every screen as
 * a two-column dashboard grid, which is what this renderer used to do, is the
 * single biggest reason the output looked like an admin template regardless of
 * what the user drew.
 *
 * This module is the treatment layer. It never changes which regions render or
 * in what order; it changes the container they render into, how much air sits
 * between them, and how wide a line of text is allowed to get.
 */

export type LayoutShell = 'stacked' | 'bento' | 'editorial' | 'conversation';

export interface ArchetypeLayout {
  shell: LayoutShell;
  /** Page measure. A landing page reads wide; a tool needs its full width. */
  maxWidthPx: number;
  /**
   * Whether the hero region gets the full viewport-height treatment. A dashboard
   * hero that eats the first screen is a dashboard nobody can use.
   */
  fullBleedHero: boolean;
  /** Whether secondary regions sit in a sidebar rail or continue the stack. */
  railed: boolean;
  /** Whether a scroll-driven section reveal is appropriate at all. */
  scrollChoreography: boolean;
  /** Copy width for prose blocks, in characters. */
  measureCh: number;
}

export const ARCHETYPE_LAYOUTS: Record<PageArchetype, ArchetypeLayout> = {
  marketing: {
    shell: 'stacked',
    maxWidthPx: 1180,
    fullBleedHero: true,
    railed: false,
    scrollChoreography: true,
    measureCh: 62,
  },
  application: {
    shell: 'bento',
    maxWidthPx: 1560,
    fullBleedHero: false,
    railed: true,
    // A tool is scrolled through repeatedly by the same person. Sections that
    // resolve on entry are charming once and obstructive on the fiftieth pass,
    // so the application shell reveals on mount instead of on scroll.
    scrollChoreography: false,
    measureCh: 72,
  },
  portfolio: {
    shell: 'editorial',
    maxWidthPx: 1320,
    fullBleedHero: true,
    railed: false,
    scrollChoreography: true,
    measureCh: 56,
  },
  'ai-native': {
    shell: 'conversation',
    maxWidthPx: 1080,
    fullBleedHero: false,
    railed: false,
    scrollChoreography: true,
    measureCh: 68,
  },
};

/**
 * How much visual weight a region carries in a given archetype.
 *
 * Drives span in the bento grid and entrance distance everywhere else. The old
 * renderer gave every region the same weight, which is why a hero and a filter
 * chip arrived with the same 8px rise.
 */
export type RegionWeight = 'lead' | 'major' | 'minor' | 'utility';

const LEAD_ROLES: ReadonlySet<SemanticRole> = new Set<SemanticRole>([
  'hero-statement',
  'page-title',
]);

const MAJOR_ROLES: ReadonlySet<SemanticRole> = new Set<SemanticRole>([
  'data-table',
  'insight-card',
  'media-card',
  'list-row',
  'form-field',
  'empty-state',
]);

const UTILITY_ROLES: ReadonlySet<SemanticRole> = new Set<SemanticRole>([
  'app-bar',
  'nav-primary',
  'nav-secondary',
  'tab-strip',
  'search-control',
  'filter-control',
  'primary-action',
  'secondary-action',
  'toast',
  'skeleton',
]);

export function weightFor(role: SemanticRole, region: LayoutRegion): RegionWeight {
  if (LEAD_ROLES.has(role) || region === 'hero') return 'lead';
  if (UTILITY_ROLES.has(role)) return 'utility';
  if (MAJOR_ROLES.has(role)) return 'major';
  return 'minor';
}

/** Entrance travel multiplier. A lead element moves further than a chip. */
export const WEIGHT_DISTANCE: Record<RegionWeight, number> = {
  lead: 56,
  major: 32,
  minor: 22,
  utility: 12,
};

/** Bento column span, out of 12, at desktop width. */
export const WEIGHT_SPAN: Record<RegionWeight, number> = {
  lead: 12,
  major: 8,
  minor: 4,
  utility: 12,
};

/**
 * The label above a section heading.
 *
 * Small, tracked-out, and specific to what the section is — an eyebrow is the
 * cheapest way to make a generated page read as authored rather than assembled,
 * and it is derived from the spec rather than invented.
 */
export function eyebrowFor(role: SemanticRole, archetype: PageArchetype): string | null {
  switch (role) {
    case 'metric-tile':
      return archetype === 'marketing' ? 'By the numbers' : 'At a glance';
    case 'insight-card':
      return archetype === 'ai-native' ? 'Model output' : 'Prioritised';
    case 'data-table':
      return 'Records';
    case 'media-card':
      return archetype === 'portfolio' ? 'Selected work' : 'Gallery';
    case 'list-row':
      return 'Recent';
    case 'form-field':
      return 'Details';
    case 'hero-statement':
    case 'page-title':
      return null;
    default:
      return null;
  }
}
