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

function branchVars(manifest: VariantManifest): React.CSSProperties {
  const radius = manifest.form.radiusOuterPx;
  return {
    '--pv-bg': manifest.palette.background,
    '--pv-surface': manifest.palette.surface,
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
  const transition = reducedMotion ? { duration: 0 } : manifest.motion.preset === 'playful'
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
                    initial={reducedMotion ? false : { opacity: 0, x: manifest.motion.preset === 'editorial' ? 0 : -10 }}
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
              initial={reducedMotion ? false : { opacity: 0, scale: manifest.motion.preset === 'editorial' ? 1 : 0.96, y: 10 }}
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
