import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
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

export function RegionHeading({ region }: { region: SpecRegion }) {
  if (!region.label) return null;
  const level = region.role === 'page-title' ? 1 : 2;
  const Tag = (level === 1 ? 'h1' : 'h2') as 'h1' | 'h2';
  return (
    <Tag className={clsx('cc-heading', level === 1 ? 'cc-heading--page' : 'cc-heading--section')}>
      {region.label}
    </Tag>
  );
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
  return (
    <button
      type={type}
      className={clsx('cc-button', `cc-button--${tone}`)}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
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
