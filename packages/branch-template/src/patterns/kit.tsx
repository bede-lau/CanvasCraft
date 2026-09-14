import clsx from 'clsx';
import { motion, type Transition, type Variants } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { useBranch } from '../runtime/branch-context';
import type { FixtureRecord, SpecRegion, RegionSelection } from '../runtime/types';

/**
 * The pattern contract.
 *
 * Every registry record resolves to a component with this signature. The
 * renderer never knows which pattern it is drawing, so swapping a region's
 * pattern — from the inspector, from a recommendation, or from a Trait Remix —
 * is a data change with no code path of its own.
 */
export interface PatternProps {
  region: SpecRegion;
  records: ReadonlyArray<FixtureRecord>;
  selection: RegionSelection | null;
  /** True while this region should render as a skeleton. */
  placeholder: boolean;
  /** True when the host has highlighted the matching canvas element. */
  highlighted: boolean;
  /** Fires the interaction this region triggers, if it has one. */
  onAct: () => void;
  /** True when the region has an interaction bound to it. */
  interactive: boolean;
}

export type PatternComponent = (props: PatternProps) => ReactNode;

/* -------------------------------------------------------------------------- */
/* Shared primitives                                                          */
/*                                                                            */
/* Styled entirely from the CSS custom properties the manifest produced, so a  */
/* branch's identity comes from tokens rather than from per-branch source.     */
/* -------------------------------------------------------------------------- */

export function Surface({
  children,
  className,
  raised = false,
  as: Tag = 'div',
  style,
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  raised?: boolean;
  as?: 'div' | 'section' | 'article' | 'aside' | 'header' | 'footer' | 'nav';
  style?: CSSProperties;
} & Record<string, unknown>) {
  return (
    <Tag
      className={clsx('cc-surface', raised && 'cc-surface--raised', className)}
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * The small tracked-out label above a heading.
 *
 * The cheapest single device that makes a generated page read as authored: it
 * gives a section a category before it gives it a name. Rendered as a sibling
 * of the heading rather than inside it so it stays out of the accessible name.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="cc-eyebrow">{children}</p>;
}

export function RegionHeading({
  region,
  eyebrow = null,
}: {
  region: SpecRegion;
  /** Category label shown above the heading. Null omits the whole line. */
  eyebrow?: string | null;
}) {
  if (!region.label) return null;
  const level = region.role === 'page-title' ? 1 : 2;
  const Tag = (level === 1 ? 'h1' : 'h2') as 'h1' | 'h2';
  return (
    <div className="cc-sectionHead">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Tag className={clsx('cc-heading', level === 1 ? 'cc-heading--page' : 'cc-heading--section')}>
        {region.label}
      </Tag>
    </div>
  );
}

/**
 * The press vocabulary, as props to spread onto any `motion.*` element.
 *
 * Anticipation and squash-and-stretch are only convincing if every control in
 * the branch winds up and deforms by the same amount — a page where the button
 * has weight and the chip beside it does not reads as a bug rather than as a
 * flourish. Returning props rather than a wrapper component keeps that shared
 * while letting each caller stay the element it already was, which matters
 * because several of these are inside a parent that is running its own
 * entrance variants and cannot take a second `animate`.
 *
 * Deliberately no `whileFocus`: keyboard navigation is instant, and a control
 * that inflates when tabbed to turns arrowing through a list into a wobble.
 */
export function usePressMotion(disabled = false): {
  variants: Variants;
  initial: string;
  animate: string;
  whileHover?: string;
  whileTap?: string;
  transition: Transition;
} {
  const { press, pressTransition } = useBranch();
  return {
    variants: press,
    initial: 'rest',
    animate: 'rest',
    whileHover: disabled ? undefined : 'hover',
    whileTap: disabled ? undefined : 'press',
    transition: pressTransition,
  };
}

export function Button({
  children,
  tone = 'primary',
  onClick,
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  tone?: 'primary' | 'secondary' | 'quiet';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const press = usePressMotion(disabled);
  return (
    <motion.button
      type={type}
      className={clsx('cc-button', `cc-button--${tone}`)}
      onClick={onClick}
      disabled={disabled}
      {...press}
    >
      {children}
    </motion.button>
  );
}

/**
 * The skeleton every pattern falls back to while loading.
 *
 * Deliberately shared: if each branch invented its own loading treatment, the
 * loading state would stop being comparable, and the loading state is one of
 * the things the product exists to compare.
 */
export function Skeleton({ lines = 3, tall = false }: { lines?: number; tall?: boolean }) {
  return (
    <div className="cc-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="cc-skeleton__line"
          style={{
            width: `${88 - index * 14}%`,
            height: tall ? 'calc(var(--space-8))' : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Announces the loading state to assistive technology, which a skeleton cannot. */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <span className="cc-visually-hidden" role="status" aria-live="polite">
      Loading {label}
    </span>
  );
}

export function EmptyMessage({
  title,
  body,
  actionLabel,
  onAct,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAct?: () => void;
}) {
  return (
    <div className="cc-empty">
      <p className="cc-empty__title">{title}</p>
      <p className="cc-empty__body">{body}</p>
      {actionLabel && onAct ? (
        <Button tone="secondary" onClick={onAct}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fixture helpers                                                            */
/* -------------------------------------------------------------------------- */

/** First string-ish field, used as a record's title. */
export function titleOf(record: FixtureRecord, fallback = 'Untitled'): string {
  const preferred = ['title', 'name', 'label', 'heading'];
  for (const key of preferred) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return fallback;
}

/** Everything except the title, in stable order, for secondary display. */
export function detailsOf(record: FixtureRecord, limit = 3): Array<[string, string]> {
  const title = titleOf(record);
  return Object.entries(record)
    .filter(([, value]) => value !== null && String(value) !== title)
    .slice(0, limit)
    .map(([key, value]) => [humanise(key), String(value)]);
}

export function humanise(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (character) => character.toUpperCase());
}

/** Column keys shared by every record, so a table has a stable header. */
export function columnsOf(records: ReadonlyArray<FixtureRecord>, limit = 5): string[] {
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) seen.add(key);
  }
  return [...seen].slice(0, limit);
}

/**
 * Splits a fixture value into a number and whatever wraps it.
 *
 * A metric only counts up if there is something to count, and fixtures carry
 * things like `"$1,240"`, `"+12%"`, and `"Review"` in the same field. Returning
 * null for the last of those is what keeps a status label from animating from
 * zero to itself.
 */
export function numericValue(
  value: string,
): { prefix: string; amount: number; suffix: string } | null {
  const match = /^(\D*?)([\d,]+(?:\.\d+)?)(\D*)$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[2]!.replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  return { prefix: match[1] ?? '', amount, suffix: match[3] ?? '' };
}
