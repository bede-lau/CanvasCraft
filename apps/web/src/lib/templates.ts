import { CanvasDoc, type CanvasArrow, type CanvasElement, type CanvasNote, type PageArchetype } from '@canvascraft/schema';

/**
 * Starter layouts for the empty canvas.
 *
 * The board used to load pre-filled with one fixed dashboard sketch (nobody
 * could tell that from a blank board — it was just always there). Now the
 * board starts genuinely empty and these are offered instead: one composed
 * layout per archetype, built on the same grid discipline a layout should
 * have regardless of who draws it — consistent outer margins, one dominant
 * element per screen, alignment to a shared column grid, and no two controls
 * competing for the same job. `whyItWorks` surfaces that reasoning in the
 * picker itself rather than leaving it implicit.
 */
export interface CanvasTemplate {
  id: string;
  name: string;
  archetype: PageArchetype;
  blurb: string;
  whyItWorks: string[];
  build: () => CanvasDoc;
}

function element(partial: Omit<CanvasElement, 'rotation' | 'z' | 'children'> & { z: number }): CanvasElement {
  return { rotation: 0, children: [], ...partial };
}

function makeDoc(
  title: string,
  archetype: PageArchetype,
  elements: CanvasElement[],
  arrows: CanvasArrow[],
  notes: CanvasNote[],
): CanvasDoc {
  const now = new Date().toISOString();
  return CanvasDoc.parse({
    version: 1,
    id: `canvas-${Math.random().toString(36).slice(2, 10)}`,
    title,
    size: { width: 1120, height: 720 },
    baseImage: null,
    elements,
    arrows,
    notes,
    strokes: [],
    designPreferences: {
      archetype,
      displayFont: 'grotesk',
      bodyFont: 'clean',
      buttonShape: 'soft',
      motionPreset: 'calm',
      motionIntensity: 'moderate',
    },
    createdAt: now,
    updatedAt: now,
  });
}

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: 'analytics-dashboard',
    name: 'Analytics dashboard',
    archetype: 'application',
    blurb: 'Search, key metrics, a priority list, and a detail table that all read as one screen.',
    whyItWorks: [
      'One dominant metrics band, not three competing ones',
      'The table and the priority list split the fold instead of stacking',
      'Search sits next to the hero it filters, not buried in a sidebar',
    ],
    build: () =>
      makeDoc(
        'Analytics dashboard',
        'application',
        [
          element({ id: 'nav', kind: 'navbar', bounds: { x: 90, y: 70, width: 930, height: 64 }, label: 'Northstar', z: 1 }),
          element({ id: 'hero', kind: 'hero', bounds: { x: 90, y: 154, width: 590, height: 112 }, label: 'Portfolio pulse', z: 2 }),
          element({ id: 'search', kind: 'input', bounds: { x: 710, y: 176, width: 310, height: 48 }, label: 'Search signals', z: 3 }),
          element({ id: 'metrics', kind: 'card', bounds: { x: 90, y: 292, width: 930, height: 126 }, label: 'Key metrics', z: 4 }),
          element({ id: 'insights', kind: 'card', bounds: { x: 90, y: 442, width: 570, height: 202 }, label: 'Priority insights', z: 5 }),
          element({ id: 'table', kind: 'table', bounds: { x: 686, y: 442, width: 334, height: 202 }, label: 'Recent activity', z: 6 }),
          // Centred on the board, not tucked against the right edge: a modal is an
          // overlay above the whole screen, so it reads as one when it sits over
          // the layout's centre with a scrim behind it (see TemplatePicker's
          // TemplateThumb) rather than clipping the metrics band off-grid.
          element({ id: 'details', kind: 'modal', bounds: { x: 340, y: 236, width: 440, height: 248 }, label: 'Insight details', z: 7 }),
        ],
        [
          {
            id: 'arrow-insight-details',
            from: 'insights',
            to: 'details',
            interaction: 'open-modal',
            label: 'open modal',
            points: [{ x: 636, y: 452 }, { x: 600, y: 430 }, { x: 566, y: 408 }],
          },
          {
            id: 'arrow-search-filter',
            from: 'search',
            to: 'insights',
            interaction: 'show-filtered-state',
            label: 'filter insights',
            points: [{ x: 860, y: 224 }, { x: 734, y: 334 }, { x: 560, y: 472 }],
          },
        ],
        [
          {
            id: 'note-tone',
            text: 'Premium, calm, and credible. Keep the same dashboard flow in every direction.',
            bounds: { x: 742, y: 78, width: 260, height: 78 },
            anchorElementId: 'hero',
            tone: 'amber',
          },
        ],
      ),
  },
  {
    id: 'marketing-landing',
    name: 'Marketing landing page',
    archetype: 'marketing',
    blurb: 'Big headline, one primary and one secondary action, product shot, three proof points.',
    whyItWorks: [
      'Exactly one primary call to action above the fold, a quieter second one beside it',
      'The product shot earns its size instead of fighting the headline for attention',
      'Three proof points, not five — the eye reads three as a set, five as a list',
    ],
    build: () =>
      makeDoc(
        'Marketing landing page',
        'marketing',
        [
          element({ id: 'nav', kind: 'navbar', bounds: { x: 90, y: 70, width: 930, height: 64 }, label: 'Brandmark', z: 1 }),
          element({ id: 'hero', kind: 'hero', bounds: { x: 90, y: 154, width: 930, height: 120 }, label: 'Ship your idea this week', z: 2 }),
          element({ id: 'cta-primary', kind: 'button', bounds: { x: 90, y: 294, width: 220, height: 56 }, label: 'Start free trial', z: 3 }),
          element({ id: 'cta-secondary', kind: 'button', bounds: { x: 330, y: 294, width: 190, height: 56 }, label: 'See pricing', z: 4 }),
          element({ id: 'preview', kind: 'media', bounds: { x: 90, y: 370, width: 930, height: 170 }, label: 'Product preview', z: 5 }),
          element({ id: 'proof-1', kind: 'card', bounds: { x: 90, y: 560, width: 290, height: 90 }, label: 'Fast', z: 6 }),
          element({ id: 'proof-2', kind: 'card', bounds: { x: 410, y: 560, width: 290, height: 90 }, label: 'Secure', z: 7 }),
          element({ id: 'proof-3', kind: 'card', bounds: { x: 730, y: 560, width: 290, height: 90 }, label: 'Simple', z: 8 }),
        ],
        [
          {
            id: 'arrow-cta-preview',
            from: 'cta-primary',
            to: 'preview',
            interaction: 'next-step',
            label: 'show product',
            points: [{ x: 200, y: 350 }, { x: 400, y: 360 }, { x: 550, y: 370 }],
          },
        ],
        [
          {
            id: 'note-tone',
            text: 'Lead with the outcome, not the feature list. One primary action above the fold.',
            bounds: { x: 90, y: 34, width: 380, height: 64 },
            anchorElementId: 'hero',
            tone: 'mint',
          },
        ],
      ),
  },
  {
    id: 'founder-portfolio',
    name: 'Founder portfolio',
    archetype: 'portfolio',
    blurb: 'Name and statement up top, one case study at a time, tabs to switch between them.',
    whyItWorks: [
      'One case study full-bleed instead of a wall of thumbnails competing for clicks',
      'Tabs make "which project" a single decision, not a scroll-and-hope',
      'Two summary cards close the story instead of trailing off',
    ],
    build: () =>
      makeDoc(
        'Founder portfolio',
        'portfolio',
        [
          element({ id: 'nav', kind: 'navbar', bounds: { x: 90, y: 70, width: 930, height: 64 }, label: 'Ava Chen — Product Designer', z: 1 }),
          element({ id: 'hero', kind: 'hero', bounds: { x: 90, y: 154, width: 930, height: 100 }, label: 'Designing calmer fintech products', z: 2 }),
          element({ id: 'categories', kind: 'tab', bounds: { x: 90, y: 274, width: 360, height: 48 }, label: 'Product / Brand / Systems', z: 3 }),
          element({ id: 'case-study', kind: 'media', bounds: { x: 90, y: 342, width: 930, height: 180 }, label: 'Selected case study', z: 4 }),
          element({ id: 'summary-1', kind: 'card', bounds: { x: 90, y: 542, width: 440, height: 108 }, label: 'Northwind — fintech dashboard redesign', z: 5 }),
          element({ id: 'summary-2', kind: 'card', bounds: { x: 580, y: 542, width: 440, height: 108 }, label: 'Halo Health — patient app', z: 6 }),
        ],
        [
          {
            id: 'arrow-tabs-case-study',
            from: 'categories',
            to: 'case-study',
            interaction: 'navigate-tab',
            label: 'switch case study',
            points: [{ x: 270, y: 322 }, { x: 400, y: 332 }, { x: 550, y: 342 }],
          },
        ],
        [
          {
            id: 'note-tone',
            text: 'Show process and outcomes, not just visuals — recruiters skim for impact.',
            bounds: { x: 90, y: 34, width: 420, height: 64 },
            anchorElementId: 'hero',
            tone: 'lilac',
          },
        ],
      ),
  },
  {
    id: 'ai-assistant',
    name: 'AI assistant',
    archetype: 'ai-native',
    blurb: 'Conversation list, one active transcript, and a composer that stays anchored at the bottom.',
    whyItWorks: [
      'The composer is pinned where a hand already rests, not floating mid-page',
      'One transcript at a time — the sidebar is history, not another content column',
      'Mode tabs sit above the transcript so switching context never scrolls it away',
    ],
    build: () =>
      makeDoc(
        'AI assistant',
        'ai-native',
        [
          element({ id: 'sidebar', kind: 'sidebar', bounds: { x: 40, y: 70, width: 220, height: 580 }, label: 'Conversations', z: 1 }),
          element({ id: 'nav', kind: 'navbar', bounds: { x: 300, y: 70, width: 730, height: 64 }, label: 'Nova Assistant', z: 2 }),
          element({ id: 'modes', kind: 'tab', bounds: { x: 300, y: 154, width: 360, height: 44 }, label: 'Chat / Docs / Code', z: 3 }),
          element({ id: 'transcript', kind: 'card', bounds: { x: 300, y: 218, width: 730, height: 340 }, label: 'Conversation', z: 4 }),
          element({ id: 'composer', kind: 'input', bounds: { x: 300, y: 578, width: 590, height: 56 }, label: 'Ask Nova anything', z: 5 }),
          element({ id: 'send', kind: 'button', bounds: { x: 910, y: 578, width: 120, height: 56 }, label: 'Send', z: 6 }),
        ],
        [
          {
            id: 'arrow-send-transcript',
            from: 'send',
            to: 'transcript',
            interaction: 'submit-with-validation',
            label: 'send message',
            points: [{ x: 950, y: 560 }, { x: 850, y: 480 }, { x: 700, y: 400 }],
          },
        ],
        [
          {
            id: 'note-tone',
            text: 'Every reply should cite what changed — trust matters more than speed here.',
            bounds: { x: 300, y: 34, width: 420, height: 64 },
            anchorElementId: 'transcript',
            tone: 'slate',
          },
        ],
      ),
  },
];
