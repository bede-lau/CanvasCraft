/**
 * jsdom has no layout engine and only a partial view API. The branch template's
 * runtime reaches for a handful of browser primitives on mount — observers, a
 * media query, smooth scrolling — and without these it throws before a single
 * assertion runs. Each stub here is inert: it lets the component mount and be
 * inspected, it never fakes a result the test then trusts.
 */

// React 19's `act` from a raw `react-dom/client` render needs this flag, or
// every render logs "not configured to support act(...)" — which the audit's
// console spy would then read as a failure.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopObserver;
}
if (!('IntersectionObserver' in globalThis)) {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NoopObserver;
}

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }

  // jsdom throws "Not implemented" for these; the template calls them from
  // scroll-into-view and reduced-motion paths.
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};

  if (typeof window.requestAnimationFrame !== 'function') {
    window.requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number;
    window.cancelAnimationFrame = (id: number) => clearTimeout(id);
  }
}
