import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Crosshair,
  Eraser,
  History,
  Layers,
  LoaderCircle,
  MoreHorizontal,
  RotateCcw,
  SendHorizontal,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import type { ManifestDelta, PatchInstruction, ScreenSpec } from '@canvascraft/schema';

type ChatScope = 'region' | 'branch';
export type PatchUiState = 'idle' | 'applying' | 'applied' | 'error';

/** One changed manifest field, phrased as before → after for the detail drawer. */
type DeltaChange = { key: string; label: string; from: string; to: string };

const EASE = [0.22, 1, 0.36, 1] as const;
const TRAIT_GROUPS = ['palette', 'typography', 'form', 'controls', 'motion'] as const;
const COMPOSER_MIN_HEIGHT = 38;
const COMPOSER_MAX_HEIGHT = 132;

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Turns the stored delta + revertTo pair into a readable before/after list.
 * The interpretation sentence says what the Director *meant*; this says what
 * it actually wrote to the manifest, which is the part worth auditing.
 */
function describeDelta(patch: PatchInstruction): DeltaChange[] {
  const changes: DeltaChange[] = [];
  for (const group of TRAIT_GROUPS) {
    const next = patch.delta[group] as Record<string, unknown> | undefined;
    if (!next) continue;
    const previous = (patch.revertTo[group] ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) continue;
      changes.push({
        key: `${group}.${key}`,
        label: `${group} · ${key}`,
        from: formatValue(previous[key]),
        to: formatValue(value),
      });
    }
  }
  for (const swap of patch.delta.selectionSwaps ?? []) {
    const before = (patch.revertTo as ManifestDelta).selectionSwaps?.find((entry) => entry.regionId === swap.regionId);
    changes.push({
      key: `swap.${swap.regionId}`,
      label: `pattern · ${swap.regionId}`,
      from: before?.recordId ?? '—',
      to: swap.recordId,
    });
  }
  return changes;
}

function StateBadge({ patch }: { patch: PatchInstruction }) {
  if (patch.state === 'failed') return <CircleAlert size={12} className="design-chat-state-icon is-fail" />;
  if (patch.state === 'reverted') return <RotateCcw size={12} className="design-chat-state-icon is-muted" />;
  return <CircleCheck size={12} className="design-chat-state-icon is-live" />;
}

/** Three dots breathing in sequence — the only honest progress signal here,
 * since a patch resolves as one unit rather than streaming tokens. */
function PendingDots() {
  return (
    <span className="design-chat-dots" aria-hidden>
      {[0, 1, 2].map((index) => (
        <motion.i
          key={index}
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: index * 0.16 }}
        />
      ))}
    </span>
  );
}

/**
 * The Design Director's conversation for one branch: a scoped history of
 * every patch sent in ("this region" or the whole branch), each message
 * deletable on its own — deleting reverts the manifest, it doesn't just hide
 * the bubble. The composer only accepts prompts long/targeted enough to
 * become a real, non-no-op change; App.tsx enforces that server-side too.
 */
export function DesignChat({
  branchId,
  branchName,
  regionId,
  regionLabel,
  spec,
  patches,
  status,
  onSend,
  onDelete,
  onDraftChange,
}: {
  branchId: string;
  branchName: string;
  regionId: string | null;
  regionLabel: string | null;
  spec: ScreenSpec;
  patches: PatchInstruction[];
  status: PatchUiState;
  onSend: (request: string) => void;
  onDelete: (patchId: string) => void;
  onDraftChange?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState<ChatScope>('region');
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const branchPatches = useMemo(
    () =>
      patches
        .filter((entry) => entry.branchId === branchId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [patches, branchId],
  );
  const regionPatches = useMemo(
    () => (regionId ? branchPatches.filter((entry) => entry.regionId === regionId) : []),
    [branchPatches, regionId],
  );
  const visible = scope === 'region' && regionId ? regionPatches : branchPatches;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [visible.length, status]);

  // Region switched underneath the chat (canvas selection changed) — the
  // composer's placeholder already tells the new story, snap back to the
  // tighter "this region" view so history stays honest about what's local.
  useEffect(() => {
    setScope('region');
    setExpandedId(null);
  }, [regionId]);

  useLayoutEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(Math.max(node.scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);

  const canSend = draft.trim().length >= 8 && Boolean(regionId) && status !== 'applying';

  const send = () => {
    if (!canSend) return;
    onSend(draft);
    setDraft('');
  };

  const deleteAllVisible = () => {
    setMenuOpen(false);
    for (const entry of visible) onDelete(entry.id);
  };

  const regionLabelFor = (id: string) => spec.regions.find((region) => region.id === id)?.label ?? id;

  return (
    <section className="inspector-section design-chat" aria-label="Design chat">
      <div className="design-chat-header">
        <div className="design-chat-tabs" role="tablist" aria-label="Chat history scope">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'region'}
            className={scope === 'region' ? 'is-active' : ''}
            onClick={() => setScope('region')}
          >
            <Crosshair size={11} />
            Region
            {regionPatches.length > 0 ? <em>{regionPatches.length}</em> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'branch'}
            className={scope === 'branch' ? 'is-active' : ''}
            onClick={() => setScope('branch')}
          >
            <Layers size={11} />
            Branch
            {branchPatches.length > 0 ? <em>{branchPatches.length}</em> : null}
          </button>
        </div>
        <div className="design-chat-actions">
          <button
            type="button"
            className="icon-button"
            title="Clear draft"
            aria-label="Clear draft"
            onClick={() => {
              setDraft('');
              inputRef.current?.focus();
            }}
          >
            <Eraser size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Jump to latest"
            aria-label="Jump to latest"
            onClick={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })}
          >
            <History size={14} />
          </button>
          <div className="design-chat-menu">
            <button
              type="button"
              className="icon-button"
              title="More actions"
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MoreHorizontal size={14} />
            </button>
            <AnimatePresence>
              {menuOpen ? (
                <motion.div
                  className="design-chat-menu-popover"
                  role="menu"
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.16, ease: EASE }}
                >
                  <button type="button" role="menuitem" disabled={visible.length === 0} onClick={deleteAllVisible}>
                    <Trash2 size={13} />
                    Delete {scope === 'region' ? 'this region’s' : 'this branch’s'} chat
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="design-chat-body" ref={listRef} onClick={() => menuOpen && setMenuOpen(false)}>
        {visible.length === 0 ? (
          <div className="design-chat-empty">
            <span className="design-chat-empty-glyph">
              <WandSparkles size={17} />
            </span>
            <p>
              {regionId
                ? `No changes yet for ${scope === 'region' ? regionLabel ?? 'this region' : branchName}.`
                : 'Select a region on the canvas to start a conversation.'}
            </p>
            {regionId ? <small>Describe a change in plain words — the Director patches this branch only.</small> : null}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visible.map((entry, index) => {
              const resolving = index < visible.length - 1;
              const changes = describeDelta(entry);
              const expanded = expandedId === entry.id;
              return (
                <motion.article
                  key={entry.id}
                  className={`design-chat-entry state-${entry.state}${expanded ? ' is-expanded' : ''}`}
                  initial={{ opacity: 0, y: 12, filter: 'blur(3px)' }}
                  animate={{
                    opacity: entry.state === 'reverted' ? 0.55 : 1,
                    y: 0,
                    scale: resolving ? 0.992 : 1,
                    filter: resolving ? 'blur(0.25px)' : 'blur(0px)',
                  }}
                  exit={{ opacity: 0, y: -8, scale: 0.96, filter: 'blur(2px)' }}
                  transition={{ duration: 0.42, ease: EASE }}
                >
                  <div className="design-chat-row is-user">
                    <p className="design-chat-bubble">{entry.request}</p>
                  </div>
                  <div className="design-chat-reply">
                    <button
                      type="button"
                      className="design-chat-reply-meta"
                      aria-expanded={expanded}
                      disabled={changes.length === 0}
                      title={changes.length ? 'Show what changed' : undefined}
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                    >
                      <StateBadge patch={entry} />
                      <span className="design-chat-reply-label">
                        {scope === 'branch' ? regionLabelFor(entry.regionId) : 'Director'}
                      </span>
                      <span className="design-chat-reply-time">{formatTime(entry.createdAt)}</span>
                      {changes.length ? (
                        <span className="design-chat-reply-count">
                          {changes.length}
                          <ChevronRight size={11} className="design-chat-chevron" />
                        </span>
                      ) : null}
                    </button>
                    <p className="design-chat-reply-body">{entry.error ?? entry.interpretation}</p>
                    <AnimatePresence initial={false}>
                      {expanded && changes.length ? (
                        <motion.ul
                          className="design-chat-delta"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: EASE }}
                        >
                          {changes.map((change) => (
                            <li key={change.key}>
                              <span className="design-chat-delta-key">{change.label}</span>
                              <span className="design-chat-delta-values">
                                <code className="is-before">{change.from}</code>
                                <ArrowRight size={10} />
                                <code className="is-after">{change.to}</code>
                              </span>
                            </li>
                          ))}
                        </motion.ul>
                      ) : null}
                    </AnimatePresence>
                  </div>
                  <button
                    type="button"
                    className="design-chat-delete"
                    aria-label="Delete this message and revert its change"
                    title="Delete and revert"
                    onClick={() => onDelete(entry.id)}
                  >
                    <X size={12} />
                  </button>
                </motion.article>
              );
            })}
          </AnimatePresence>
        )}
        {status === 'applying' ? (
          <motion.div
            className="design-chat-typing"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <PendingDots />
            Applying to {regionLabel ?? 'this region'}…
          </motion.div>
        ) : null}
      </div>

      <div className="design-chat-composer" role="presentation" onClick={() => inputRef.current?.focus()}>
        <textarea
          ref={inputRef}
          value={draft}
          maxLength={500}
          rows={1}
          disabled={!regionId}
          placeholder={
            regionId
              ? `Change only ${regionLabel ?? 'this region'} in ${branchName}…`
              : 'Select a region to chat about it.'
          }
          onChange={(event) => {
            setDraft(event.target.value);
            onDraftChange?.();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        {status === 'error' ? <p className="field-error">Describe the intended change in at least eight characters.</p> : null}
        <div className="design-chat-composer-row">
          <span className="design-chat-chip" title={regionId ? `Scoped to ${regionLabel ?? regionId}` : 'No region selected'}>
            <Crosshair size={11} />
            <span>{regionLabel ?? 'No region'}</span>
          </span>
          {draft.length > 380 ? <span className="design-chat-hint">{draft.length}/500</span> : null}
          <button
            type="button"
            className="design-chat-send"
            disabled={!canSend}
            onClick={send}
            aria-label="Send"
            title={canSend ? 'Send (Enter)' : 'Describe the change in at least eight characters'}
          >
            {status === 'applying' ? <LoaderCircle size={14} className="spin" /> : <SendHorizontal size={14} />}
          </button>
        </div>
      </div>
    </section>
  );
}
