import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { BranchRecord, VariantManifest } from '@canvascraft/schema';
import { orchestratorUrl } from '../lib/orchestrator';

/**
 * Every branch of a run has its own Daytona sandbox, its own Vite `preview`
 * server, and its own proxied preview URL. The review pane used to show one
 * `<iframe>` and swap its `src` on every branch change, so each switch paid a
 * full cold SPA load. This keeps one iframe per serving branch mounted at once
 * and toggles visibility instead — the first load of each is the only wait.
 */
function servingSrc(branch: BranchRecord): string | null {
  if (branch.status !== 'serving' || !branch.previewUrl) return null;
  const url = orchestratorUrl(branch.previewUrl);
  // The sandbox rebuilds `dist/` in place on Apply, so the URL is unchanged and
  // the iframe would keep the pre-patch document. Tying the src to the branch
  // revision is what actually reloads it — same rule the single-iframe path used.
  return `${url}${url.includes('?') ? '&' : '?'}rev=${encodeURIComponent(branch.updatedAt)}`;
}

/** Themes the transitional loading page from the branch's own manifest, so the
 *  wait reads as "this direction, warming up" rather than a generic spinner. */
function loadingVars(manifest: VariantManifest): CSSProperties {
  const palette = manifest.palette;
  return {
    '--lbf-bg': palette.background,
    '--lbf-surface': palette.surfaceRaised || palette.surface,
    '--lbf-accent': palette.accent,
    '--lbf-accent-contrast': palette.accentContrast,
    '--lbf-text': palette.textPrimary,
    '--lbf-muted': palette.textSecondary,
    '--lbf-border': palette.border,
    '--lbf-ease': manifest.motion.easing,
    '--lbf-duration': `${manifest.motion.durationMs}ms`,
  } as CSSProperties;
}

export function LiveBranchFrame({
  branches,
  selectedId,
  manifestFor,
  selectedFrameRef,
  onSelectedReady,
  reducedMotion,
}: {
  branches: BranchRecord[];
  selectedId: string;
  manifestFor: (id: string) => VariantManifest | undefined;
  /** The shared ref the parent posts state/viewport/highlight commands through.
   *  Kept pointed at whichever frame is on screen. */
  selectedFrameRef: RefObject<HTMLIFrameElement | null>;
  /** Called when the on-screen frame is ready — a real `load`, or a switch to a
   *  frame that already loaded — so the parent re-syncs preview state into it. */
  onSelectedReady: () => void;
  reducedMotion: boolean;
}) {
  const serving = useMemo(
    () =>
      branches
        .map((branch) => ({ branch, src: servingSrc(branch) }))
        .filter((entry): entry is { branch: BranchRecord; src: string } => entry.src !== null),
    [branches],
  );

  const frames = useRef(new Map<string, HTMLIFrameElement>());
  // id -> the src string that has finished loading in that frame.
  const [loaded, setLoaded] = useState<Record<string, string>>({});

  const selectedEntry = serving.find((entry) => entry.branch.id === selectedId) ?? null;
  const selectedReady = selectedEntry !== null && loaded[selectedId] === selectedEntry.src;

  useEffect(() => {
    selectedFrameRef.current = frames.current.get(selectedId) ?? null;
    // A switch to a frame that already finished loading fires no `load` event,
    // so nothing would re-push the current state/viewport into it without this.
    if (selectedReady) onSelectedReady();
  }, [selectedId, selectedReady, selectedFrameRef, onSelectedReady]);

  const handleLoad = useCallback(
    (id: string, src: string) => {
      setLoaded((prev) => (prev[id] === src ? prev : { ...prev, [id]: src }));
      if (id === selectedId) onSelectedReady();
    },
    [selectedId, onSelectedReady],
  );

  const loadingManifest = manifestFor(selectedId);
  const showLoading = !selectedReady && loadingManifest !== undefined;

  return (
    <div className="live-branch-frame" data-loading={showLoading ? 'true' : 'false'}>
      {serving.map(({ branch, src }) => {
        const active = branch.id === selectedId;
        return (
          <iframe
            key={branch.id}
            ref={(element) => {
              if (element) frames.current.set(branch.id, element);
              else frames.current.delete(branch.id);
              if (active) selectedFrameRef.current = element;
            }}
            src={src}
            title={`${branch.name} live branch preview`}
            className="live-branch-preview"
            hidden={!active}
            tabIndex={active ? undefined : -1}
            aria-hidden={active ? undefined : 'true'}
            onLoad={() => handleLoad(branch.id, src)}
          />
        );
      })}
      {showLoading ? (
        <div
          className="live-branch-frame__loading"
          style={loadingVars(loadingManifest)}
          data-reduced-motion={reducedMotion ? 'true' : 'false'}
          role="status"
          aria-live="polite"
        >
          <span className="live-branch-frame__mark" aria-hidden="true">
            {(loadingManifest.name.trim()[0] ?? 'B').toUpperCase()}
          </span>
          <p className="live-branch-frame__title">Warming {loadingManifest.name}</p>
          <div className="live-branch-frame__bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="live-branch-frame__hint">Isolated live sandbox · first paint</p>
        </div>
      ) : null}
    </div>
  );
}
