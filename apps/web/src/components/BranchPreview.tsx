import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { StateKind, VariantManifest } from '@canvascraft/schema';
import { DEMO_SPEC } from '../lib/demo';

/**
 * Backdrop and surface treatments, mirrored from the branch template.
 *
 * This component is a *simulation* of a generated branch, shown only when no
 * Daytona sandbox is serving the real thing — the iframe is always the source
 * of truth, and the frame bar says so. It is kept on the same visual axes as
 * the real renderer (backdrop, surface fill, elevation, motion language) rather
 * than pixel-matched to it: a mock that reproduces the template exactly is a
 * second copy of the template to keep in sync, and a mock that ignores those
 * axes tells the reviewer the three directions look alike when they do not.
 */
function backdropFor(palette: VariantManifest['palette']): string {
  const { background, surfaceRaised, accent, scheme } = palette;
  const veil = scheme === 'dark' ? 22 : 12;

  switch (palette.backdrop) {
    case 'wash':
      return `radial-gradient(120% 80% at 12% -10%, color-mix(in srgb, ${accent} ${veil}%, transparent) 0%, transparent 60%), ${background}`;
    case 'aurora':
      return `radial-gradient(65% 45% at 20% 6%, color-mix(in srgb, ${accent} ${veil + 10}%, transparent) 0%, transparent 62%), radial-gradient(60% 45% at 88% 26%, color-mix(in srgb, ${palette.positive} ${veil}%, transparent) 0%, transparent 60%), ${background}`;
    case 'spotlight':
      return `radial-gradient(70% 55% at 50% -15%, color-mix(in srgb, ${surfaceRaised} 85%, transparent) 0%, transparent 65%), ${background}`;
    case 'grain':
      return `linear-gradient(180deg, color-mix(in srgb, ${surfaceRaised} 55%, ${background}) 0%, ${background} 42%), ${background}`;
    case 'flat':
    default:
      return background;
  }
}

function surfaceFillFor(manifest: VariantManifest, raised: boolean): string {
  const { palette, form } = manifest;
  const base = raised ? palette.surfaceRaised : palette.surface;
  const dark = palette.scheme === 'dark';

  switch (form.surface) {
    case 'glass':
      return `color-mix(in srgb, ${base} ${dark ? 62 : 72}%, transparent)`;
    case 'gradient':
      return `linear-gradient(165deg, color-mix(in srgb, ${palette.accent} ${dark ? 12 : 7}%, ${base}) 0%, ${base} 46%, color-mix(in srgb, ${palette.background} ${dark ? 40 : 55}%, ${base}) 100%)`;
    case 'outline':
      return 'transparent';
    case 'solid':
    default:
      return base;
  }
}

const ELEVATION_SHADOW: Record<VariantManifest['form']['elevation'], (dark: boolean) => string> = {
  flat: () => 'none',
  hairline: () => '0 0 0 1px var(--pv-border)',
  raised: (dark) =>
    dark
      ? '0 1px 1px rgba(0,0,0,0.5), 0 4px 10px rgba(0,0,0,0.4)'
      : '0 1px 1px rgba(16,20,28,0.05), 0 4px 10px rgba(16,20,28,0.07)',
  lifted: (dark) =>
    dark
      ? '0 2px 3px rgba(0,0,0,0.55), 0 10px 24px rgba(0,0,0,0.45)'
      : '0 2px 3px rgba(16,20,28,0.06), 0 10px 24px rgba(16,20,28,0.09)',
};

function branchVars(manifest: VariantManifest): React.CSSProperties {
  const radius = manifest.form.radiusOuterPx;
  const dark = manifest.palette.scheme === 'dark';
  return {
    '--pv-bg': manifest.palette.background,
    '--pv-backdrop': backdropFor(manifest.palette),
    '--pv-surface': manifest.palette.surface,
    '--pv-surface-fill': surfaceFillFor(manifest, false),
    '--pv-surface-fill-raised': surfaceFillFor(manifest, true),
    '--pv-blur': manifest.form.surface === 'glass' ? '14px' : '0px',
    '--pv-shadow': ELEVATION_SHADOW[manifest.form.elevation](dark),
    '--pv-raised': manifest.palette.surfaceRaised,
    '--pv-border': manifest.palette.border,
    '--pv-text': manifest.palette.textPrimary,
    '--pv-muted': manifest.palette.textSecondary,
    '--pv-accent': manifest.palette.accent,
    '--pv-accent-contrast': manifest.palette.accentContrast,
    '--pv-positive': manifest.palette.positive,
    '--pv-critical': manifest.palette.critical,
    '--pv-radius': `${radius}px`,
    '--pv-radius-inner': `${Math.max(2, radius - manifest.form.radiusStepPx)}px`,
    '--pv-space': `${manifest.form.spaceUnitPx * (manifest.form.density === 'compact' ? 0.8 : manifest.form.density === 'roomy' ? 1.25 : 1)}px`,
    '--pv-display': manifest.typography.displayFamily,
    '--pv-body': manifest.typography.bodyFamily,
    '--pv-duration': `${manifest.motion.durationMs}ms`,
    '--pv-duration-fast': `${Math.round(manifest.motion.durationMs * 0.4)}ms`,
    '--pv-easing': manifest.motion.easing,
  } as React.CSSProperties;
}

function Skeleton() {
  return (
    <div className="preview-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function BranchPreview({
  manifest,
  state,
  selectedRegion,
  onSelectRegion,
  viewport,
  auditionKey,
  auditionState,
  reducedMotion,
}: {
  manifest: VariantManifest;
  state: StateKind;
  selectedRegion: string | null;
  onSelectRegion: (id: string) => void;
  viewport: 'desktop' | 'mobile';
  auditionKey: number;
  auditionState: StateKind | null;
  reducedMotion: boolean;
}) {
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [replayedState, setReplayedState] = useState<StateKind | null>(null);
  useEffect(() => {
    setReplayedState(null);
  }, [manifest.id, state]);
  useEffect(() => {
    if (auditionKey === 0 || !auditionState) return;
    setReplayedState(auditionState);
  }, [auditionKey, auditionState]);
  const effectiveState = replayedState ?? state;
  const isLoading = effectiveState === 'loading';
  const isEmpty = effectiveState === 'empty';
  const isModal = effectiveState === 'modal' || modalOpen;
  const isError = effectiveState === 'error';
  const isSuccess = effectiveState === 'success';
  const insights = useMemo(() => {
    const records = DEMO_SPEC.fixtures.find((entry) => entry.regionId === 'insight-deck')?.records ?? [];
    if (isEmpty) return [];
    if (effectiveState !== 'filtered' && !query.trim()) return records;
    const needle = query.trim().toLowerCase();
    const matches = records.filter((record) =>
      Object.values(record).some((value) => String(value ?? '').toLowerCase().includes(needle)),
    );
    return matches.length > 0 ? matches : records.slice(0, 1);
  }, [effectiveState, isEmpty, query]);

  const metrics = DEMO_SPEC.fixtures.find((entry) => entry.regionId === 'metric-shelf')?.records ?? [];
  const activity = DEMO_SPEC.fixtures.find((entry) => entry.regionId === 'activity-table')?.records ?? [];
  // Keyed off the motion *language*, not the preset: the preset is the run-wide
  // tempo the toolbar locks, so branching on it made all three simulations move
  // identically — the same bug the real renderer had.
  const transition = reducedMotion
    ? { duration: 0 }
    : manifest.motion.language === 'spring'
      ? { type: 'spring' as const, stiffness: 300, damping: 22 }
      : { duration: manifest.motion.durationMs / 1000 };

  const regionClass = (id: string) => `preview-region ${selectedRegion === id ? 'is-highlighted' : ''}`;

  return (
    <motion.div
      key={`${manifest.id}-${auditionKey}`}
      className={`branch-preview ${viewport === 'mobile' || effectiveState === 'narrow' ? 'is-mobile' : ''} density-${manifest.form.density}`}
      style={branchVars(manifest)}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={transition}
    >
      <header className={regionClass('app-bar')} onClick={() => onSelectRegion('app-bar')}>
        <div className="preview-brand">
          <span className="preview-brand-mark">N</span>
          <span>Northstar</span>
        </div>
        <nav aria-label="Prototype navigation">
          <button type="button" className="is-current">Overview</button>
          <button type="button">Initiatives</button>
          <button type="button">Signals</button>
        </nav>
        <div className="preview-avatar" aria-label="Maya Chen">MC</div>
      </header>

      <main>
        <div className="preview-topline">
          <section className={regionClass('page-intro')} onClick={() => onSelectRegion('page-intro')}>
            <p className="preview-eyebrow">FRIDAY REVIEW · AUG 29</p>
            <h1>Portfolio pulse</h1>
            <p>Focus the team on the signals that changed this week.</p>
          </section>
          <label className={`${regionClass('search-control')} preview-search`} onClick={() => onSelectRegion('search-control')}>
            <Search size={17} aria-hidden="true" />
            <span className="visually-hidden">Search signals</span>
            <input
              value={query}
              placeholder="Search signals"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={15} />
              </button>
            ) : null}
          </label>
        </div>

        <section className={`${regionClass('metric-shelf')} preview-metrics`} onClick={() => onSelectRegion('metric-shelf')}>
          {isLoading
            ? [0, 1, 2].map((index) => <Skeleton key={index} />)
            : metrics.map((metric, index) => (
                <motion.article
                  key={String(metric.title)}
                  initial={reducedMotion ? false : { opacity: 0, y: manifest.motion.travel * 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition, delay: reducedMotion ? 0 : index * manifest.motion.staggerMs / 1000 }}
                >
                  <span>{String(metric.title)}</span>
                  <strong>{String(metric.value)}</strong>
                  <small>{String(metric.delta)}</small>
                </motion.article>
              ))}
        </section>

        <div className="preview-grid">
          <section className={`${regionClass('insight-deck')} preview-insights`} onClick={() => onSelectRegion('insight-deck')}>
            <div className="preview-section-heading">
              <div>
                <span>PRIORITISED BY CHANGE</span>
                <h2>Priority insights</h2>
              </div>
              <button type="button" aria-label="Open all insights">
                <ArrowUpRight size={17} />
              </button>
            </div>
            {isLoading ? (
              <Skeleton />
            ) : insights.length === 0 ? (
              <div className="preview-empty">
                <Search size={22} />
                <strong>No signals found</strong>
                <span>Clear the filter to restore the shared fixture set.</span>
                <button type="button" onClick={() => setQuery('')}>Clear filter</button>
              </div>
            ) : (
              <div className="preview-insight-list">
                {insights.map((insight, index) => (
                  <motion.button
                    key={String(insight.title)}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setModalOpen(true);
                      onSelectRegion('insight-deck');
                    }}
                    initial={reducedMotion ? false : { opacity: 0, x: manifest.motion.language === 'cut' ? 0 : -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...transition, delay: reducedMotion ? 0 : index * manifest.motion.staggerMs / 1000 }}
                  >
                    <span className="preview-insight-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="preview-insight-copy">
                      <strong>{String(insight.title)}</strong>
                      <small>{String(insight.detail)}</small>
                    </span>
                    <span className="preview-insight-status">{String(insight.status)}</span>
                    <ChevronRight size={17} />
                  </motion.button>
                ))}
              </div>
            )}
          </section>

          <section className={`${regionClass('activity-table')} preview-activity`} onClick={() => onSelectRegion('activity-table')}>
            <div className="preview-section-heading">
              <div>
                <span>LAST 7 DAYS</span>
                <h2>Recent activity</h2>
              </div>
            </div>
            {isLoading ? (
              <Skeleton />
            ) : (
              <div className="preview-table-wrap">
                <table>
                  <thead><tr><th>Initiative</th><th>Owner</th><th>Status</th></tr></thead>
                  <tbody>
                    {activity.map((row) => (
                      <tr key={String(row.initiative)}>
                        <td>{String(row.initiative)}</td>
                        <td>{String(row.owner)}</td>
                        <td><span>{String(row.status)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      <AnimatePresence>
        {isModal ? (
          <motion.div
            className="preview-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={() => setModalOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="insight-dialog-title"
              className={`${regionClass('insight-dialog')} preview-modal`}
              initial={reducedMotion ? false : { opacity: 0, scale: manifest.motion.language === 'cut' ? 1 : 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={transition}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="preview-modal-icon"><Sparkles size={18} /></div>
              <button type="button" className="preview-modal-close" aria-label="Close dialog" onClick={() => setModalOpen(false)}>
                <X size={17} />
              </button>
              <p>PRIORITY SIGNAL</p>
              <h2 id="insight-dialog-title">Activation is accelerating</h2>
              <span>Onboarding completion rose 18% after the guided setup experiment. The strongest lift is in teams under 50 seats.</span>
              <div className="preview-modal-actions">
                <button type="button" onClick={() => setModalOpen(false)}>Keep watching</button>
                <button type="button" className="is-primary" onClick={() => setModalOpen(false)}>Create follow-up</button>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isSuccess || isError ? (
          <motion.div
            role="status"
            className={`preview-toast ${isError ? 'is-error' : ''}`}
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            {isError ? <CircleAlert size={17} /> : <Check size={17} />}
            <span>{isError ? 'Preview patch could not be applied. Try a smaller request.' : 'Branch updated locally.'}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
