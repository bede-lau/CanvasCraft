import { useState } from 'react';
import { ArrowRight, Check, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { WorkspaceEntry } from '../lib/workspaces';
import { CanvasThumb } from './CanvasThumb';

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * One recallable draft. Two-step delete (trash → confirm/cancel) replaces a
 * native `confirm()` — it reads as part of the card's own motion rather than
 * an interruption, and it's the one action here with real "follow through":
 * the card doesn't just vanish, it settles out before the list reflows.
 */
export function WorkspaceCard({
  entry,
  index,
  onOpen,
  onDelete,
}: {
  entry: WorkspaceEntry;
  index: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { canvas, run } = entry;

  return (
    <motion.article
      layout
      className="template-card workspace-card"
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.22, delay: Math.min(index, 6) * 0.04, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <button
        type="button"
        className="workspace-card__hit"
        onClick={onOpen}
        aria-label={run ? `Reopen ${canvas.title} directions` : `Open ${canvas.title}`}
      >
        <CanvasThumb doc={canvas} />
        {run ? (
          <span className={`workspace-card__badge ${run.serving ? 'is-serving' : ''}`}>
            {run.serving ? 'serving' : 'generated'}
          </span>
        ) : null}
      </button>
      <div className="template-card__body workspace-card__body">
        <h3>{canvas.title}</h3>
        <span className="workspace-card__meta">
          {run
            ? `${relativeTime(run.savedAt)} · ${run.branchCount} direction${run.branchCount === 1 ? '' : 's'}${
                run.championName ? ` · ${run.championName}` : ''
              }`
            : `${relativeTime(canvas.updatedAt)} · ${canvas.elements.length} element${canvas.elements.length === 1 ? '' : 's'}`}
        </span>
        <div className="workspace-card__actions">
          <button type="button" className="header-button workspace-card__open" onClick={onOpen}>
            <span>{run ? 'Open directions' : 'Open'}</span>
            <ArrowRight size={14} />
          </button>
          {confirming ? (
            <motion.div
              className="workspace-card__confirm"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.14 }}
            >
              <button type="button" className="icon-button" onClick={() => setConfirming(false)} aria-label="Cancel delete">
                <X size={14} />
              </button>
              <button type="button" className="icon-button workspace-card__confirm-yes" onClick={onDelete} aria-label={`Confirm deleting ${canvas.title}`}>
                <Check size={14} />
              </button>
            </motion.div>
          ) : (
            <button
              type="button"
              className="icon-button workspace-card__delete"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${canvas.title}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}
