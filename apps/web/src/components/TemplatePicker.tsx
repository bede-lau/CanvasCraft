import { useEffect, useState } from 'react';
import { ArrowRight, History, LayoutTemplate, PenLine } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import type { CanvasDoc } from '@canvascraft/schema';
import { CANVAS_TEMPLATES, type CanvasTemplate } from '../lib/templates';
import type { WorkspaceEntry } from '../lib/workspaces';
import { CanvasThumb } from './CanvasThumb';
import { WorkspaceCard } from './WorkspaceCard';

/** Mirrors CanvasStudio's `ARCHETYPE_OPTIONS` labels so the same archetype reads the same everywhere. */
const ARCHETYPE_LABEL: Record<CanvasTemplate['archetype'], string> = {
  marketing: 'Landing page',
  application: 'App / dashboard',
  portfolio: 'Portfolio',
  'ai-native': 'AI product',
};

type PickerTab = 'continue' | 'templates';

export function TemplatePicker({
  workspaces = [],
  onPick,
  onSkip,
  onOpenWorkspace,
  onDeleteWorkspace,
}: {
  workspaces?: WorkspaceEntry[];
  onPick: (doc: CanvasDoc) => void;
  onSkip: () => void;
  onOpenWorkspace?: (entry: WorkspaceEntry) => void;
  onDeleteWorkspace?: (id: string) => void;
}) {
  const hasWorkspaces = workspaces.length > 0;
  const [tab, setTab] = useState<PickerTab>(hasWorkspaces ? 'continue' : 'templates');

  // Deleting the last saved draft while "Continue" is open would otherwise
  // leave the tab showing nothing — fall back to templates instead.
  useEffect(() => {
    if (!hasWorkspaces && tab === 'continue') setTab('templates');
  }, [hasWorkspaces, tab]);

  return (
    <div className="template-picker" role="dialog" aria-label="Choose a starting point">
      {hasWorkspaces ? (
        <div className="picker-tabs" role="tablist" aria-label="Starting point">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'continue'}
            className="picker-tab"
            onClick={() => setTab('continue')}
          >
            <History size={14} />
            <span>Continue</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'templates'}
            className="picker-tab"
            onClick={() => setTab('templates')}
          >
            <LayoutTemplate size={14} />
            <span>Templates</span>
          </button>
        </div>
      ) : null}

      {tab === 'continue' && hasWorkspaces ? (
        <>
          <div className="template-picker__intro">
            <div>
              <h2><History size={18} /> Your workspaces</h2>
            </div>
            <button type="button" className="header-button" onClick={onSkip}>
              <PenLine size={15} />
              <span>Start with a blank canvas</span>
            </button>
          </div>
          <div className="template-grid workspace-grid">
            <AnimatePresence>
              {workspaces.map((entry, index) => (
                <WorkspaceCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  onOpen={() => onOpenWorkspace?.(entry)}
                  onDelete={() => onDeleteWorkspace?.(entry.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <>
          <div className="template-picker__intro">
            <div>
              <h2><LayoutTemplate size={18} /> Start from a template</h2>
            </div>
            <button type="button" className="header-button" onClick={onSkip}>
              <PenLine size={15} />
              <span>Start with a blank canvas</span>
            </button>
          </div>
          <div className="template-grid">
            {CANVAS_TEMPLATES.map((template) => (
              <article key={template.id} className="template-card">
                <CanvasThumb doc={template.build()} />
                <div className="template-card__body">
                  <span className="template-card__archetype">{ARCHETYPE_LABEL[template.archetype]}</span>
                  <h3>{template.name}</h3>
                  <p>{template.blurb}</p>
                  <ul>
                    {template.whyItWorks.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <button type="button" className="primary-button" onClick={() => onPick(template.build())}>
                    Use this template
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
