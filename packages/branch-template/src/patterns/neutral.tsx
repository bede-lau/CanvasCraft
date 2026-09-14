import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Menu, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { useBranch } from '../runtime/branch-context';
import { useScreen } from '../runtime/screen-store';
import { countUp } from '../runtime/motion';
import { eyebrowFor } from '../runtime/archetype';
import {
  Button,
  EmptyMessage,
  Eyebrow,
  LoadingAnnouncement,
  RegionHeading,
  Skeleton,
  Surface,
  columnsOf,
  detailsOf,
  humanise,
  numericValue,
  titleOf,
  usePressMotion,
  type PatternComponent,
} from './kit';

/**
 * CanvasCraft's own patterns.
 *
 * Two jobs. First, they are what a region renders when no third-party pattern
 * passes the licence and compatibility gate — so a gate rejection costs the
 * branch a specific flourish, never its functionality. Second, they cover the
 * ordinary roles no curated pattern is needed for.
 *
 * They used to be written to be "quiet and correct", which in practice meant
 * hairline boxes with a label and a number in them — and because most regions
 * fall through to here, quiet-and-correct *was* the product's visual identity.
 * They are now written to be finished: real eyebrows, a display-type hierarchy,
 * counted numbers, hover states with intent, and depth that comes from the
 * manifest's own surface and elevation traits. Correctness did not move; the
 * bar for "done" did.
 */

const AppBar: PatternComponent = ({ region, records }) => {
  const { manifest, secondary } = useBranch();
  const togglePress = usePressMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = records.length > 0 ? records : [];
  const mark = (region.label || 'Workspace').trim().charAt(0).toUpperCase();
  const isActionArchetype = manifest.archetype === 'marketing' || manifest.archetype === 'portfolio';
  const hasCollapsibleContent = items.length > 0 || isActionArchetype;

  return (
    <Surface as="header" className="cc-appbar" data-region={region.id}>
      <span className="cc-appbar__mark" aria-hidden="true">
        {mark}
      </span>
      <span className="cc-appbar__title">{region.label || 'Workspace'}</span>
      {/* Below the narrow breakpoint the nav+CTA move into this toggle-driven
          dropdown instead of vanishing — see .cc-preview--narrow .cc-appbar__menu
          in styles.css. At desktop width this button stays display:none and
          .cc-appbar__menu is display:contents, so nothing changes there. */}
      {hasCollapsibleContent ? (
        <motion.button
          type="button"
          className="cc-appbar__menu-toggle"
          aria-expanded={menuOpen}
          aria-controls={`${region.id}-menu`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((value) => !value)}
          {...togglePress}
        >
          {/* Anticipation: the trigger turns before the panel below it has
              arrived, so the press is acknowledged by the thing that was
              pressed rather than only by the thing it summoned. Rotation is a
              secondary action — it supports the toggle without competing with
              the menu that is the actual event. */}
          <motion.span
            className="cc-appbar__menu-glyph"
            animate={{ rotate: menuOpen ? 90 : 0 }}
            transition={secondary}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </motion.span>
        </motion.button>
      ) : null}
      <div id={`${region.id}-menu`} className={clsx('cc-appbar__menu', menuOpen && 'is-open')}>
        {items.length > 0 ? (
          <nav className="cc-appbar__nav" aria-label={region.label || 'Primary'}>
            {items.slice(0, 4).map((record, index) => (
              <span key={index} className={clsx('cc-appbar__link', index === 0 && 'is-current')}>
                {titleOf(record)}
              </span>
            ))}
          </nav>
        ) : null}
        {/* Marketing and portfolio pages end their bar with an action; a tool ends
            it with the person using it. Both are a real end to the row rather
            than trailing whitespace, which is what made the old bar read unfinished. */}
        {isActionArchetype ? (
          <span className="cc-appbar__cta">
            <Button tone="primary">Get started</Button>
          </span>
        ) : null}
      </div>
      {!isActionArchetype ? (
        <span className="cc-appbar__avatar" aria-hidden="true">
          {mark}
        </span>
      ) : null}
    </Surface>
  );
};

const Nav: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { screen, dispatch } = useScreen();
  const { stateChange } = useBranch();
  const press = usePressMotion();
  if (placeholder) return <Skeleton lines={4} />;

  const items = records.length > 0 ? records : [{ title: region.label || 'Overview' }];

  return (
    <nav className="cc-nav" aria-label={region.label || 'Sections'} data-region={region.id}>
      {items.map((record, index) => {
        const id = `${region.id}-${index}`;
        const active = screen.activeTabId === id || (screen.activeTabId === null && index === 0);
        return (
          <motion.button
            key={id}
            type="button"
            className={clsx('cc-nav__item', active && 'cc-nav__item--active')}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              dispatch({ type: 'set-tab', tabId: id });
              if (interactive) onAct();
            }}
            {...press}
          >
            {/* The rail travels between items rather than switching off here and
                on there. Selection is one thing moving, and a shared layout id
                is the only way to say that — two independent fades say "these
                are unrelated", which is exactly what the reader must not
                conclude about a nav. */}
            {active ? (
              <motion.span
                className="cc-nav__rail"
                layoutId={`${region.id}-nav-rail`}
                transition={stateChange}
                aria-hidden="true"
              />
            ) : (
              <span className="cc-nav__rail" aria-hidden="true" />
            )}
            {titleOf(record)}
          </motion.button>
        );
      })}
    </nav>
  );
};

/**
 * The hero.
 *
 * The one element on the page allowed to be theatrical, and the one the old
 * renderer treated exactly like a paragraph. It gets the display scale, the
 * gradient-masked lead line, and the branch's own hero entrance rather than the
 * shared list-item fade.
 */
const Hero: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { hero, transition, manifest, layout, stage } = useBranch();
  if (placeholder) return <Skeleton lines={2} tall />;

  const lead = records[0];
  const supporting = records.slice(1, 4);

  return (
    <motion.section
      className={clsx('cc-hero', layout.fullBleedHero && 'cc-hero--full')}
      data-region={region.id}
      initial="hidden"
      animate="visible"
      variants={hero}
      transition={transition}
    >
      {/*
        Staging: the eyebrow, the headline, the lead and the actions are four
        acts, not one block, and they are read in that order. Offsetting each by
        `stage(n)` means one thing at a time carries the eye down the hero —
        arriving simultaneously is what makes a hero read as a wall of text that
        happened to fade in. The delays are capped in `stageDelay`, so a long
        hero never turns the offset into a wait.
      */}
      <div className="cc-hero__body" data-parallax-layer>
        <motion.div variants={hero} transition={{ ...transition, delay: stage(0) }}>
          <Eyebrow>{manifest.palette.name}</Eyebrow>
        </motion.div>
        <motion.h1
          className="cc-heading cc-heading--display"
          variants={hero}
          transition={{ ...transition, delay: stage(1) }}
        >
          {region.label || 'A clearer view'}
        </motion.h1>
        <motion.p
          className="cc-hero__lead"
          variants={hero}
          transition={{ ...transition, delay: stage(2) }}
        >
          {lead ? titleOf(lead) : region.purpose}
        </motion.p>
        {interactive ? (
          <motion.div
            className="cc-hero__actions"
            variants={hero}
            transition={{ ...transition, delay: stage(3) }}
          >
            <Button tone="primary" onClick={onAct}>
              Continue
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button tone="quiet" onClick={onAct}>
              See how it works
            </Button>
          </motion.div>
        ) : null}
      </div>
      {supporting.length > 0 ? (
        <ul className="cc-hero__proof">
          {supporting.map((record, index) => (
            <li key={index}>
              <strong>{titleOf(record)}</strong>
              <span>{detailsOf(record, 1)[0]?.[1] ?? ''}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </motion.section>
  );
};

/** A metric that counts up to its value, because a number nobody watched is a label. */
function Metric({ label, value, delta }: { label: string; value: string; delta: string | null }) {
  const { manifest, reducedMotion, secondary } = useBranch();
  const target = numericValue(value);
  const [shown, setShown] = useState(target === null ? value : '0');

  useEffect(() => {
    if (target === null) {
      setShown(value);
      return;
    }
    return countUp(target.amount, manifest.motion, reducedMotion, (current) => {
      setShown(`${target.prefix}${Math.round(current).toLocaleString()}${target.suffix}`);
    });
  }, [manifest.motion, reducedMotion, target?.amount, target?.prefix, target?.suffix, value]);

  return (
    <Surface raised className="cc-metric">
      <span className="cc-metric__label">{label}</span>
      {/* The counted text is decorative duplication for assistive technology,
          which reads the final value from the sibling below instead of watching
          digits change. */}
      <span className="cc-metric__value" aria-hidden="true">
        {shown}
      </span>
      <span className="cc-visually-hidden">{value}</span>
      {/* The delta is the secondary action to the count: it arrives just after
          the number has started moving and settles before it stops, so it reads
          as part of the same fact rather than as a second thing to look at.
          `y` only — a delta that scales competes with the digits above it. */}
      {delta ? (
        <motion.span
          className="cc-metric__delta"
          initial={reducedMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={secondary}
        >
          {delta}
        </motion.span>
      ) : null}
    </Surface>
  );
}

const MetricShelf: PatternComponent = ({ region, records, placeholder }) => {
  const { container, enter, transition, manifest } = useBranch();
  if (placeholder) {
    return (
      <>
        <LoadingAnnouncement label={region.label || 'metrics'} />
        <div className="cc-metrics">
          {[0, 1, 2].map((index) => (
            <Surface key={index} raised className="cc-metric">
              <Skeleton lines={2} />
            </Surface>
          ))}
        </div>
      </>
    );
  }

  const items = records.length > 0 ? records : [{ title: region.label, value: '—' }];
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  return (
    <>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <motion.div
        className="cc-metrics"
        data-region={region.id}
        initial="hidden"
        animate="visible"
        variants={container}
      >
        {items.slice(0, 4).map((record, index) => {
          const details = detailsOf(record, 2);
          return (
            <motion.div key={index} variants={enter} transition={transition} data-reveal-item>
              <Metric
                label={titleOf(record)}
                value={String(details[0]?.[1] ?? '—')}
                delta={details[1] ? String(details[1][1]) : null}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </>
  );
};

const CardGrid: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { container, enter, transition, manifest } = useBranch();
  const { dispatch, screen } = useScreen();
  const press = usePressMotion();
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <LoadingAnnouncement label={region.label || 'cards'} />
        <div className="cc-cards">
          {[0, 1, 2].map((index) => (
            <Surface key={index} raised className="cc-card">
              <Skeleton lines={3} />
            </Surface>
          ))}
        </div>
      </>
    );
  }

  if (records.length === 0) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <EmptyMessage
          title="Nothing here yet"
          body={`${region.label || 'This section'} fills in as work lands.`}
          actionLabel={interactive ? 'Add the first one' : undefined}
          onAct={interactive ? onAct : undefined}
        />
      </>
    );
  }

  return (
    <>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <motion.div
        className="cc-cards"
        data-region={region.id}
        initial="hidden"
        animate="visible"
        variants={container}
      >
        {records.map((record, index) => (
          <motion.div key={index} variants={enter} transition={transition} data-reveal-item>
            <Surface
              raised
              as="article"
              className={clsx('cc-card', screen.selectedIndex === index && 'cc-card--selected')}
            >
              <span className="cc-card__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <motion.button
                type="button"
                className="cc-card__hit"
                onClick={() => {
                  dispatch({ type: 'select', index });
                  if (interactive) onAct();
                }}
                {...press}
              >
                <span className="cc-card__title">{titleOf(record)}</span>
                <ArrowUpRight className="cc-card__go" aria-hidden="true" />
              </motion.button>
              <dl className="cc-card__meta">
                {detailsOf(record).map(([key, value]) => (
                  <div key={key} className="cc-card__metaRow">
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </Surface>
          </motion.div>
        ))}
      </motion.div>
    </>
  );
};

const RecordList: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { container, enter, transition, manifest } = useBranch();
  const { dispatch, screen } = useScreen();
  const press = usePressMotion();
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <LoadingAnnouncement label={region.label || 'items'} />
        <Skeleton lines={5} />
      </>
    );
  }

  if (records.length === 0) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <EmptyMessage
          title="No matches"
          body="Adjust the filter to see more."
          actionLabel={interactive ? 'Clear filter' : undefined}
          onAct={interactive ? onAct : undefined}
        />
      </>
    );
  }

  return (
    <>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <motion.ul
        className="cc-list"
        data-region={region.id}
        initial="hidden"
        animate="visible"
        variants={container}
      >
        {records.map((record, index) => (
          <motion.li key={index} variants={enter} transition={transition} data-reveal-item>
            <motion.button
              type="button"
              className={clsx('cc-list__row', screen.selectedIndex === index && 'cc-list__row--selected')}
              aria-pressed={screen.selectedIndex === index}
              onClick={() => {
                dispatch({ type: 'select', index });
                if (interactive) onAct();
              }}
              {...press}
            >
              <span className="cc-list__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="cc-list__title">{titleOf(record)}</span>
              <span className="cc-list__meta">{detailsOf(record, 2).map(([, value]) => value).join(' · ')}</span>
              <ChevronRight className="cc-list__go" aria-hidden="true" />
            </motion.button>
          </motion.li>
        ))}
      </motion.ul>
    </>
  );
};

const RecordTable: PatternComponent = ({ region, records, placeholder }) => {
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

  return (
    <>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <div className="cc-tableWrap" data-region={region.id}>
        <table className="cc-table">
          <caption className="cc-visually-hidden">{region.purpose || region.label}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {humanise(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>{String(record[column] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const SearchControl: PatternComponent = ({ region, onAct, interactive }) => {
  const { screen, dispatch } = useScreen();
  const { exitFor } = useBranch();
  const press = usePressMotion();
  const inputId = `${region.id}-input`;

  return (
    <div className="cc-search" data-region={region.id}>
      <label className="cc-visually-hidden" htmlFor={inputId}>
        {region.label || 'Search'}
      </label>
      <span className="cc-search__icon" aria-hidden="true">
        <Search />
      </span>
      <input
        id={inputId}
        className="cc-input cc-search__input"
        type="search"
        placeholder={region.label || 'Search'}
        value={screen.query}
        onChange={(event) => dispatch({ type: 'set-query', query: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && interactive) onAct();
        }}
      />
      {/* The clear affordance appears and leaves as the query does. Its exit is
          the state-scale one rather than the entrance played backwards: a
          control that is no longer relevant should already be gone by the time
          the reader looks for it. */}
      <AnimatePresence>
        {screen.query ? (
          <motion.button
            type="button"
            className="cc-search__clear"
            onClick={() => dispatch({ type: 'set-query', query: '' })}
            exit={{ opacity: 0, scale: 0.9, transition: exitFor('state') }}
            {...press}
          >
            <X aria-hidden="true" />
            <span className="cc-visually-hidden">Clear search</span>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

const FilterControl: PatternComponent = ({ region, records, onAct, interactive }) => {
  const { screen, dispatch } = useScreen();
  const { stateChange } = useBranch();
  const press = usePressMotion();
  const options = records.length > 0 ? records.map((record) => titleOf(record)) : ['All', 'Active', 'Archived'];

  return (
    <div className="cc-filters" role="group" aria-label={region.label || 'Filters'} data-region={region.id}>
      {options.slice(0, 4).map((option) => {
        const active = screen.query === option;
        return (
          <motion.button
            key={option}
            type="button"
            className={clsx('cc-chip', active && 'cc-chip--active')}
            aria-pressed={active}
            onClick={() => {
              dispatch({ type: 'set-query', query: active ? '' : option });
              if (interactive) onAct();
            }}
            {...press}
          >
            {/* Selection is one fill travelling between chips, not four fills
                independently crossfading. It sits behind the label on its own
                layer so the moving thing is a painted rectangle and the text
                never animates — a filter whose labels slide is a filter nobody
                can read mid-change. */}
            {active ? (
              <motion.span
                className="cc-chip__fill"
                layoutId={`${region.id}-chip-fill`}
                transition={stateChange}
                aria-hidden="true"
              />
            ) : null}
            <span className="cc-chip__label">{option}</span>
          </motion.button>
        );
      })}
    </div>
  );
};

const PrimaryAction: PatternComponent = ({ region, onAct }) => (
  <div className="cc-actions" data-region={region.id}>
    <Button tone="primary" onClick={onAct}>
      {region.label || 'Continue'}
      <ArrowRight aria-hidden="true" />
    </Button>
  </div>
);

const SecondaryAction: PatternComponent = ({ region, onAct }) => (
  <div className="cc-actions" data-region={region.id}>
    <Button tone="secondary" onClick={onAct}>
      {region.label || 'Learn more'}
    </Button>
  </div>
);

const FormFields: PatternComponent = ({ region, records, placeholder, onAct }) => {
  const { screen } = useScreen();
  const { manifest } = useBranch();
  if (placeholder) return <Skeleton lines={4} />;

  const fields = records.length > 0 ? records.map((record) => titleOf(record)) : ['Name', 'Owner'];
  const invalid = screen.state === 'error';

  return (
    <form
      className="cc-form"
      data-region={region.id}
      onSubmit={(event) => {
        event.preventDefault();
        onAct();
      }}
    >
      <RegionHeading region={region} eyebrow={eyebrowFor(region.role, manifest.archetype)} />
      {fields.slice(0, 4).map((field, index) => {
        const id = `${region.id}-field-${index}`;
        const showError = invalid && index === 0;
        return (
          <div key={id} className="cc-field">
            <label className="cc-field__label" htmlFor={id}>
              {field}
            </label>
            <input
              id={id}
              className={clsx('cc-input', showError && 'cc-input--invalid')}
              aria-invalid={showError || undefined}
              aria-describedby={showError ? `${id}-error` : undefined}
            />
            {showError ? (
              <p className="cc-field__error" id={`${id}-error`}>
                {screen.validationMessage ?? 'This field is required.'}
              </p>
            ) : null}
          </div>
        );
      })}
      <Button tone="primary" type="submit">
        {region.label || 'Save'}
      </Button>
    </form>
  );
};

const MediaGrid: PatternComponent = ({ region, records, placeholder }) => {
  const { container, enter, transition, manifest } = useBranch();
  if (placeholder) return <Skeleton lines={3} tall />;

  const items = records.length > 0 ? records : [{ title: 'Untitled' }];

  return (
    <>
      <RegionHeading region={region} eyebrow={eyebrowFor(region.role, manifest.archetype)} />
      <motion.div
        className="cc-media"
        data-region={region.id}
        initial="hidden"
        animate="visible"
        variants={container}
      >
        {items.map((record, index) => (
          <motion.figure
            key={index}
            className="cc-media__item"
            variants={enter}
            transition={transition}
            data-reveal-item
          >
            {/* The frame is the artwork here — there is no real image in a
                fixture — so it is composed from the palette rather than left as
                a grey box, and it carries the parallax layer on a portfolio. */}
            <div className="cc-media__frame" data-parallax-layer aria-hidden="true">
              <span className="cc-media__index">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <figcaption className="cc-media__caption">
              <span className="cc-media__title">{titleOf(record)}</span>
              <span className="cc-media__detail">{detailsOf(record, 1)[0]?.[1] ?? ''}</span>
            </figcaption>
          </motion.figure>
        ))}
      </motion.div>
    </>
  );
};

const TextBlock: PatternComponent = ({ region, records, placeholder }) => {
  const { manifest } = useBranch();
  if (placeholder) return <Skeleton lines={3} />;
  const body = records[0] ? titleOf(records[0]) : region.purpose;
  return (
    <section className="cc-text" data-region={region.id}>
      <RegionHeading region={region} eyebrow={eyebrowFor(region.role, manifest.archetype)} />
      <p className="cc-text__body">{body}</p>
    </section>
  );
};

const NeutralBlock: PatternComponent = ({ region, placeholder }) => {
  if (placeholder) return <Skeleton lines={2} />;
  return (
    <Surface className="cc-block" data-region={region.id}>
      <RegionHeading region={region} />
      <p className="cc-text__body">{region.purpose}</p>
    </Surface>
  );
};

const SuccessNote: PatternComponent = ({ region }) => (
  <div className="cc-note cc-note--positive" role="status" data-region={region.id}>
    <Check aria-hidden="true" />
    <span>{region.label || 'Saved'}</span>
  </div>
);

export const NEUTRAL_PATTERNS = {
  'canvascraft-app-bar': AppBar,
  'canvascraft-nav': Nav,
  'canvascraft-hero': Hero,
  'canvascraft-metric-shelf': MetricShelf,
  'canvascraft-card-grid': CardGrid,
  'canvascraft-record-list': RecordList,
  'canvascraft-record-table': RecordTable,
  'canvascraft-search': SearchControl,
  'canvascraft-filters': FilterControl,
  'canvascraft-primary-action': PrimaryAction,
  'canvascraft-secondary-action': SecondaryAction,
  'canvascraft-form': FormFields,
  'canvascraft-media-grid': MediaGrid,
  'canvascraft-text': TextBlock,
  'canvascraft-block': NeutralBlock,
  'canvascraft-success-note': SuccessNote,
} satisfies Record<string, PatternComponent>;

export type NeutralPatternId = keyof typeof NEUTRAL_PATTERNS;
