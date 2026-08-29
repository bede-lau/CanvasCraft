import {
  PREVIEW_CHANNEL,
  type PreviewCommand,
  type PreviewMessage,
  type StateKind,
} from './types';

/**
 * The host bridge.
 *
 * State-Locked Comparison and Motion Audition work by the host asking all three
 * frames to do the same thing at the same time. That only compares fairly if
 * every branch answers the same commands, which is why this file is part of the
 * snapshot rather than something generated per branch.
 *
 * `targetOrigin` is '*' because each sandbox is served from its own
 * unpredictable preview host and cannot know the workspace's origin ahead of
 * time. Nothing sensitive crosses this channel — it carries UI state names and
 * region ids for a mock screen with no real data — and inbound messages are
 * validated by shape before being acted on.
 */

export interface BridgeHandlers {
  onCommand: (command: PreviewCommand) => void;
}

function isPreviewCommand(value: unknown): value is PreviewCommand {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  switch (candidate.type) {
    case 'set-state':
      return isStateKind(candidate.state);
    case 'replay-interaction':
      return typeof candidate.interactionId === 'string';
    case 'set-viewport':
      return candidate.width === 'desktop' || candidate.width === 'mobile';
    case 'highlight-region':
      return candidate.regionId === null || typeof candidate.regionId === 'string';
    case 'set-reduced-motion':
      return typeof candidate.enabled === 'boolean';
    case 'ping':
      return true;
    default:
      return false;
  }
}

export function createBridge(branchId: string, handlers: BridgeHandlers): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    if (window.parent !== window && event.source !== window.parent) return;
    const data = event.data;
    if (typeof data !== 'object' || data === null) return;

    const envelope = data as { channel?: unknown; payload?: unknown };
    if (envelope.channel !== PREVIEW_CHANNEL) return;
    if (!isPreviewCommand(envelope.payload)) return;

    handlers.onCommand(envelope.payload);
  };

  window.addEventListener('message', listener);
  send(branchId, { type: 'ready', branchId });

  return () => window.removeEventListener('message', listener);
}

const STATE_KINDS: ReadonlySet<StateKind> = new Set([
  'default',
  'loading',
  'empty',
  'filtered',
  'selected',
  'modal',
  'drawer',
  'success',
  'error',
  'narrow',
]);

function isStateKind(value: unknown): value is StateKind {
  return typeof value === 'string' && STATE_KINDS.has(value as StateKind);
}

export function send(branchId: string, message: PreviewMessage): void {
  // Not embedded — running the branch directly in a tab is a supported way to
  // look at it, and should not throw.
  if (window.parent === window) return;

  window.parent.postMessage(
    { channel: PREVIEW_CHANNEL, branchId, payload: message },
    '*',
  );
}

/**
 * Reports an uncaught error to the host so a broken branch shows a real reason
 * on its card instead of a blank iframe.
 */
export function reportErrors(branchId: string): () => void {
  const onError = (event: ErrorEvent) => {
    send(branchId, { type: 'error', message: event.message });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    send(branchId, { type: 'error', message: String(event.reason) });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
