import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import gsap from 'gsap';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { useBranch } from '../runtime/branch-context';
import { useScreen } from '../runtime/screen-store';
import { eyebrowFor } from '../runtime/archetype';
import {
  EmptyMessage,
  LoadingAnnouncement,
  RegionHeading,
  Skeleton,
  columnsOf,
  detailsOf,
  humanise,
  numericValue,
  titleOf,
  usePressMotion,
  type PatternComponent,
} from './kit';

/**
 * Expressive motion patterns.
 *
 * ── Card Swap ──────────────────────────────────────────────────────────────
 * Adapted from React Bits "Card Swap".
 * Source: https://reactbits.dev/components/card-swap
 *
 * MIT + Commons Clause License Condition v1.0
 * Copyright (c) 2026 David Haz
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, and distribute the Software as part of
 * an application, website, or product, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * Commons Clause Restriction: You may use this Software, including for any
 * commercial purpose, so long as you do not sell, sublicense, or redistribute
 * the components themselves — whether alone, in a bundle, or as a ported
 * version.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 *
 * CanvasCraft uses this inside a running preview only. Source export of
 * third-party patterns is disabled product-wide (ADR 0006), which is what keeps
 * the Commons Clause restriction satisfied.
 * ───────────────────────────────────────────────────────────────────────────
 */

interface Slot {
  x: number;
  y: number;
  z: number;
  zIndex: number;
}

function makeSlot(index: number, distX: number, distY: number, total: number): Slot {
  return {
    x: index * distX,
    y: -index * distY,
    z: -index * distX * 1.5,
    zIndex: total - index,
  };
}

function placeNow(element: HTMLElement, slot: Slot, skew: number): void {
  gsap.set(element, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    zIndex: slot.zIndex,
    xPercent: -50,
    yPercent: -50,
    skewY: skew,
    transformOrigin: 'center center',
    force3D: true,
  });
}

export const SwapCard = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    onClick?: () => void;
  }
>(
  function SwapCard({ children, className, style, onClick }, ref) {
    return (
      <div
        ref={ref}
        className={`cc-swapCard ${className ?? ''}`}
        style={style}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick?.();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {children}
      </div>
    );
  },
);

function CardSwap({
  children,
  width = 420,
  height = 280,
  cardDistance = 60,
  verticalDistance = 70,
  delay = 5000,
  skewAmount = 6,
  easing = 'elastic',
  paused = false,
  onCardClick,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  skewAmount?: number;
  easing?: 'linear' | 'elastic';
  paused?: boolean;
  onCardClick?: (index: number) => void;
}) {
  const config = useMemo(
    () =>
      easing === 'elastic'
        ? {
            ease: 'elastic.out(0.6,0.9)',
            durDrop: 2,
            durMove: 2,
            durReturn: 2,
            promoteOverlap: 0.9,
            returnDelay: 0.05,
          }
        : {
            ease: 'power1.inOut',
            durDrop: 0.8,
            durMove: 0.8,
            durReturn: 0.8,
            promoteOverlap: 0.45,
            returnDelay: 0.2,
          },
    [easing],
  );

  const childArray = useMemo(
    () => Children.toArray(children).filter(isValidElement) as ReactElement<{ ref?: unknown }>[],
    [children],
  );

  const refs = useRef<Array<HTMLDivElement | null>>([]);
  refs.current = childArray.map((_, index) => refs.current[index] ?? null);

  const order = useRef<number[]>([]);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const interval = useRef<number | null>(null);

  useEffect(() => {
    const total = refs.current.length;
    if (total === 0) return;

    order.current = Array.from({ length: total }, (_, index) => index);

    order.current.forEach((cardIndex, slotIndex) => {
      const element = refs.current[cardIndex];
      if (element) placeNow(element, makeSlot(slotIndex, cardDistance, verticalDistance, total), skewAmount);
    });

    // Reduced motion: the stack is still readable as a stack — it simply does
    // not cycle. No information is lost, which is the whole rule.
    if (paused) return;

    const swap = () => {
      if (order.current.length < 2) return;

      const [front, ...rest] = order.current;
      const frontElement = refs.current[front!];
      if (!frontElement) return;

      const tl = gsap.timeline();
      timeline.current = tl;

      tl.to(frontElement, { y: '+=500', duration: config.durDrop, ease: config.ease });
      tl.addLabel('promote', `-=${config.durDrop * config.promoteOverlap}`);

      rest.forEach((cardIndex, index) => {
        const element = refs.current[cardIndex];
        if (!element) return;
        const slot = makeSlot(index, cardDistance, verticalDistance, refs.current.length);
        tl.set(element, { zIndex: slot.zIndex }, 'promote');
        tl.to(
          element,
          { x: slot.x, y: slot.y, z: slot.z, duration: config.durMove, ease: config.ease },
          `promote+=${index * 0.15}`,
        );
      });

      const backSlot = makeSlot(
        refs.current.length - 1,
        cardDistance,
        verticalDistance,
        refs.current.length,
      );
      tl.addLabel('return', `promote+=${config.durMove * config.returnDelay}`);
      tl.call(() => gsap.set(frontElement, { zIndex: backSlot.zIndex }), undefined, 'return');
      tl.set(frontElement, { x: backSlot.x, z: backSlot.z }, 'return');
      tl.to(frontElement, { y: backSlot.y, duration: config.durReturn, ease: config.ease }, 'return');
      tl.call(() => {
        order.current = [...rest, front!];
      });
    };

    // The stack is placed statically above (placeNow); the cycle starts one
    // `delay` later, never synchronously. Swapping a card the instant the
    // section mounts throws the front card 500px through the layout before the
    // reader has looked at it — the "animates on load" failure the QA audit
    // guards, and the reason "01" was missing on first paint.
    const first = window.setTimeout(() => {
      swap();
      interval.current = window.setInterval(swap, delay);
    }, delay);

    return () => {
      window.clearTimeout(first);
      if (interval.current !== null) window.clearInterval(interval.current);
      timeline.current?.kill();
    };
  }, [cardDistance, verticalDistance, delay, skewAmount, paused, config, childArray.length]);

  return (
    <div className="cc-swap" style={{ width, height }}>
      {childArray.map((child, index) =>
        cloneElement(child as ReactElement<Record<string, unknown>>, {
          key: index,
          ref: (element: HTMLDivElement | null) => {
            refs.current[index] = element;
          },
          style: { width, height },
          onClick: () => onCardClick?.(index),
        }),
      )}
    </div>
  );
}

/**
 * The registry adapter.
 *
 * Only reached for a deliberate stacked hero, insight deck, testimonial, or
 * portfolio-card intent — the registry's `roles` field enforces that. Anything
 * else falls back to the neutral card grid.
 */
const CardSwapPattern: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { reducedMotion, manifest } = useBranch();
  const { dispatch } = useScreen();

  if (placeholder) return <Skeleton lines={3} tall />;

  const items = records.length > 0 ? records : [{ title: region.label || 'Insight' }];

  // Fewer than two cards is a stack of one. Rendering the swap machinery for
  // that would animate nothing and confuse the reader.
  if (items.length < 2) {
    return (
      <div className="cc-swapFallback">
        <RegionHeading region={region} />
        <div className="cc-card cc-surface cc-surface--raised">
          <span className="cc-card__title">{titleOf(items[0]!)}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="cc-swapRegion" data-region={region.id}>
      <RegionHeading region={region} />
      <CardSwap
        paused={reducedMotion}
        // Driven by the branch's motion language rather than its preset: the
        // preset is the run-wide tempo the toolbar locks, so keying off it made
        // every branch's stack behave identically.
        easing={manifest.motion.language === 'cut' ? 'linear' : 'elastic'}
        delay={manifest.motion.language === 'spring' ? 3200 : 5000}
        skewAmount={manifest.motion.language === 'cut' ? 2 : 6}
        onCardClick={(index) => {
          dispatch({ type: 'select', index });
          if (interactive) onAct();
        }}
      >
        {items.slice(0, 4).map((record, index) => (
          <SwapCard key={index}>
            <span className="cc-swapCard__index">{String(index + 1).padStart(2, '0')}</span>
            <span className="cc-swapCard__title">{titleOf(record)}</span>
            <dl className="cc-swapCard__meta">
              {detailsOf(record, 2).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </SwapCard>
        ))}
      </CardSwap>

      {/*
        The animated stack is decorative for anyone who cannot see it move, and
        GSAP transforms are invisible to a screen reader. The same records are
        exposed here as a plain list so the region is never information-poor.
      */}
      <ul className="cc-visually-hidden">
        {items.map((record, index) => (
          <li key={index}>{titleOf(record)}</li>
        ))}
      </ul>
    </section>
  );
};

/**
 * ── Data Table ─────────────────────────────────────────────────────────────
 * Adapted from ReUI "Data Table" conventions (https://reui.io/).
 * MIT License. Copyright belongs to the original component author.
 *
 * A sticky header and a per-row trend bar are what a plain `<table>` cannot
 * offer on its own: a dense list stays legible past the fold, and a numeric
 * column reads as a trend at a glance rather than as a column of digits.
 * ───────────────────────────────────────────────────────────────────────────
 */
const DataTablePattern: PatternComponent = ({ region, records, placeholder }) => {
  const { manifest } = useBranch();
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <LoadingAnnouncement label={region.label || 'table'} />
        <Skeleton lines={6} />
      </>
    );
  }

  if (records.length === 0) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <EmptyMessage title="No rows" body="Nothing matches the current view." />
      </>
    );
  }

  const columns = columnsOf(records);
  // A column counts as numeric when most rows parse as a number — "most"
  // rather than "all", because a stray "—" placeholder should not disqualify
  // an otherwise numeric column from getting its trend bar.
  const numericColumn = columns.find(
    (column) =>
      records.filter((record) => numericValue(String(record[column] ?? '')) !== null).length >=
      Math.ceil(records.length * 0.6),
  );
  const numericValues = numericColumn
    ? records.map((record) => numericValue(String(record[numericColumn] ?? ''))?.amount ?? 0)
    : [];
  const maxValue = numericValues.length > 0 ? Math.max(...numericValues, 1) : 1;

  return (
    <>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <div className="cc-tableWrap cc-tableWrap--sticky" data-region={region.id}>
        <table className="cc-table">
          <caption className="cc-visually-hidden">{region.purpose || region.label}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className={clsx(column === numericColumn && 'cc-table__numeric')}>
                  {humanise(column)}
                </th>
              ))}
              {numericColumn ? <th scope="col" className="cc-visually-hidden">Trend</th> : null}
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column} className={clsx(column === numericColumn && 'cc-table__numeric')}>
                    {String(record[column] ?? '—')}
                  </td>
                ))}
                {numericColumn ? (
                  <td className="cc-table__spark" aria-hidden="true">
                    <span style={{ width: `${Math.max(6, (numericValues[index]! / maxValue) * 100)}%` }} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

/**
 * ── Tabs ───────────────────────────────────────────────────────────────────
 * Adapted from coss ui "Tabs" conventions (https://ui.coss.com/).
 * MIT License. Copyright belongs to the original component author.
 *
 * Real `role="tab"` semantics plus a `layoutId` indicator that slides between
 * tabs rather than jumping — the one place a spring reads as feedback rather
 * than decoration, because it is answering the click that just happened.
 * ───────────────────────────────────────────────────────────────────────────
 */
const TabsPattern: PatternComponent = ({ region, records, onAct, interactive }) => {
  const { screen, dispatch } = useScreen();
  const { manifest, stateChange } = useBranch();
  const press = usePressMotion();
  const items = records.length > 0 ? records : [{ title: region.label || 'Overview' }];

  return (
    <div className="cc-tabs" role="tablist" aria-label={region.label || 'Sections'} data-region={region.id}>
      {items.map((record, index) => {
        const id = `${region.id}-${index}`;
        const active = screen.activeTabId === id || (screen.activeTabId === null && index === 0);
        return (
          <motion.button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={clsx('cc-tabs__tab', active && 'cc-tabs__tab--active')}
            onClick={() => {
              dispatch({ type: 'set-tab', tabId: id });
              if (interactive) onAct();
            }}
            {...press}
          >
            {titleOf(record)}
            {active ? (
              <motion.span
                className="cc-tabs__indicator"
                layoutId={`${region.id}-tabs-indicator`}
                // A spring only where the branch's language argues for one; every
                // other branch gets the in-place state curve rather than the
                // hard-coded 420/34 that used to make three directions slide
                // their indicator at exactly the same speed.
                transition={
                  manifest.motion.language === 'spring'
                    ? { type: 'spring', stiffness: 420, damping: 34 }
                    : stateChange
                }
              />
            ) : null}
          </motion.button>
        );
      })}
    </div>
  );
};

export const EXPRESSIVE_PATTERNS = {
  'react-bits-card-swap': CardSwapPattern,
  'reui-data-table': DataTablePattern,
  'coss-ui-tabs': TabsPattern,
};
