import { motion } from 'motion/react';
import { Search, ChevronRight, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { useBranch } from '../runtime/branch-context';
import { useScreen } from '../runtime/screen-store';
import {
  Button,
  EmptyMessage,
  LoadingAnnouncement,
  RegionHeading,
  Skeleton,
  Surface,
  columnsOf,
  detailsOf,
  humanise,
  titleOf,
  type PatternComponent,
} from './kit';

/**
 * CanvasCraft's own neutral patterns.
 *
 * Two jobs. First, they are what a region renders when no third-party pattern
 * passes the licence and compatibility gate — so a gate rejection costs the
 * branch its visual flourish, never its functionality. Second, they cover the
 * ordinary roles no curated pattern is needed for.
 *
 * They are written to be quiet and correct rather than expressive. A branch
 * whose regions all fall back should still look deliberate.
 */

const AppBar: PatternComponent = ({ region, records }) => {
  const items = records.length > 0 ? records : [];
  return (
    <Surface as="header" className="cc-appbar" data-region={region.id}>
      <span className="cc-appbar__mark" aria-hidden="true" />
      <span className="cc-appbar__title">{region.label || 'Workspace'}</span>
      {items.length > 0 ? (
        <nav className="cc-appbar__nav" aria-label={region.label || 'Primary'}>
          {items.slice(0, 4).map((record, index) => (
            <span key={index} className="cc-appbar__link">
              {titleOf(record)}
            </span>
          ))}
        </nav>
      ) : null}
    </Surface>
  );
};

const Nav: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { screen, dispatch } = useScreen();
  if (placeholder) return <Skeleton lines={4} />;

  const items = records.length > 0 ? records : [{ title: region.label || 'Overview' }];

  return (
    <nav className="cc-nav" aria-label={region.label || 'Sections'} data-region={region.id}>
      {items.map((record, index) => {
        const id = `${region.id}-${index}`;
        const active = screen.activeTabId === id || (screen.activeTabId === null && index === 0);
        return (
          <button
            key={id}
            type="button"
            className={clsx('cc-nav__item', active && 'cc-nav__item--active')}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              dispatch({ type: 'set-tab', tabId: id });
              if (interactive) onAct();
            }}
          >
            {titleOf(record)}
          </button>
        );
      })}
    </nav>
  );
};

const Hero: PatternComponent = ({ region, records, placeholder }) => {
  const { enter, transition } = useBranch();
  if (placeholder) return <Skeleton lines={2} tall />;

  const lead = records[0];
  return (
    <motion.section
      className="cc-hero"
      data-region={region.id}
      initial="hidden"
      animate="visible"
      variants={enter}
      transition={transition}
    >
      <h1 className="cc-heading cc-heading--page">{region.label || 'A clearer view'}</h1>
      <p className="cc-hero__lead">{lead ? titleOf(lead) : region.purpose}</p>
    </motion.section>
  );
};

const MetricShelf: PatternComponent = ({ region, records, placeholder }) => {
  const { container, enter, transition } = useBranch();
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

  return (
    <motion.div
      className="cc-metrics"
      data-region={region.id}
      initial="hidden"
      animate="visible"
      variants={container}
    >
      {items.slice(0, 4).map((record, index) => {
        const details = detailsOf(record, 1);
        return (
          <motion.div key={index} variants={enter} transition={transition}>
            <Surface raised className="cc-metric">
              <span className="cc-metric__label">{titleOf(record)}</span>
              <span className="cc-metric__value">{details[0]?.[1] ?? '—'}</span>
            </Surface>
          </motion.div>
        );
      })}
    </motion.div>
  );
};

const CardGrid: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { container, enter, transition } = useBranch();
  const { dispatch, screen } = useScreen();

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} />
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
        <RegionHeading region={region} />
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
      <RegionHeading region={region} />
      <motion.div
        className="cc-cards"
        data-region={region.id}
        initial="hidden"
        animate="visible"
        variants={container}
      >
        {records.map((record, index) => (
          <motion.div key={index} variants={enter} transition={transition}>
            <Surface
              raised
              as="article"
              className={clsx('cc-card', screen.selectedIndex === index && 'cc-card--selected')}
            >
              <button
                type="button"
                className="cc-card__hit"
                onClick={() => {
                  dispatch({ type: 'select', index });
                  if (interactive) onAct();
                }}
              >
                <span className="cc-card__title">{titleOf(record)}</span>
              </button>
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
  const { container, enter, transition } = useBranch();
  const { dispatch, screen } = useScreen();

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} />
        <LoadingAnnouncement label={region.label || 'items'} />
        <Skeleton lines={5} />
      </>
    );
  }

  if (records.length === 0) {
    return (
      <>
        <RegionHeading region={region} />
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
      <RegionHeading region={region} />
      <motion.ul
        className="cc-list"
        data-region={region.id}
        initial="hidden"
        animate="visible"
        variants={container}
      >
        {records.map((record, index) => (
          <motion.li key={index} variants={enter} transition={transition}>
            <button
              type="button"
              className={clsx('cc-list__row', screen.selectedIndex === index && 'cc-list__row--selected')}
              aria-pressed={screen.selectedIndex === index}
              onClick={() => {
                dispatch({ type: 'select', index });
                if (interactive) onAct();
              }}
            >
              <span className="cc-list__title">{titleOf(record)}</span>
              <span className="cc-list__meta">{detailsOf(record, 2).map(([, value]) => value).join(' · ')}</span>
              <ChevronRight size="var(--icon-size)" strokeWidth="var(--icon-stroke)" aria-hidden="true" />
            </button>
          </motion.li>
        ))}
      </motion.ul>
    </>
  );
};

const RecordTable: PatternComponent = ({ region, records, placeholder }) => {
  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} />
        <LoadingAnnouncement label={region.label || 'table'} />
        <Skeleton lines={6} />
      </>
    );
  }

  if (records.length === 0) {
    return (
      <>
        <RegionHeading region={region} />
        <EmptyMessage title="No rows" body="Nothing matches the current view." />
      </>
    );
  }

  const columns = columnsOf(records);

  return (
    <>
      <RegionHeading region={region} />
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
  const inputId = `${region.id}-input`;

  return (
    <div className="cc-search" data-region={region.id}>
      <label className="cc-visually-hidden" htmlFor={inputId}>
        {region.label || 'Search'}
      </label>
      <span className="cc-search__icon" aria-hidden="true">
        <Search size="var(--icon-size)" strokeWidth="var(--icon-stroke)" />
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
      {screen.query ? (
        <button
          type="button"
          className="cc-search__clear"
          onClick={() => dispatch({ type: 'set-query', query: '' })}
        >
          <X size="var(--icon-size)" strokeWidth="var(--icon-stroke)" aria-hidden="true" />
          <span className="cc-visually-hidden">Clear search</span>
        </button>
      ) : null}
    </div>
  );
};

const FilterControl: PatternComponent = ({ region, records, onAct, interactive }) => {
  const { screen, dispatch } = useScreen();
  const options = records.length > 0 ? records.map((record) => titleOf(record)) : ['All', 'Active', 'Archived'];

  return (
    <div className="cc-filters" role="group" aria-label={region.label || 'Filters'} data-region={region.id}>
      {options.slice(0, 4).map((option) => {
        const active = screen.query === option;
        return (
          <button
            key={option}
            type="button"
            className={clsx('cc-chip', active && 'cc-chip--active')}
            aria-pressed={active}
            onClick={() => {
              dispatch({ type: 'set-query', query: active ? '' : option });
              if (interactive) onAct();
            }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
};

const PrimaryAction: PatternComponent = ({ region, onAct }) => (
  <div className="cc-actions" data-region={region.id}>
    <Button tone="primary" onClick={onAct}>
      {region.label || 'Continue'}
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
      <RegionHeading region={region} />
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
  const { container, enter, transition } = useBranch();
  if (placeholder) return <Skeleton lines={3} tall />;

  const items = records.length > 0 ? records : [{ title: 'Untitled' }];

  return (
    <>
      <RegionHeading region={region} />
      <motion.div
        className="cc-media"
        data-region={region.id}
        initial="hidden"
        animate="visible"
        variants={container}
      >
        {items.map((record, index) => (
          <motion.figure key={index} className="cc-media__item" variants={enter} transition={transition}>
            <div className="cc-media__frame" aria-hidden="true" />
            <figcaption className="cc-media__caption">{titleOf(record)}</figcaption>
          </motion.figure>
        ))}
      </motion.div>
    </>
  );
};

const TextBlock: PatternComponent = ({ region, records, placeholder }) => {
  if (placeholder) return <Skeleton lines={3} />;
  const body = records[0] ? titleOf(records[0]) : region.purpose;
  return (
    <section className="cc-text" data-region={region.id}>
      <RegionHeading region={region} />
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
    <Check size="var(--icon-size)" strokeWidth="var(--icon-stroke)" aria-hidden="true" />
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
