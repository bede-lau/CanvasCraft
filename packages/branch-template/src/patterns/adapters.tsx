import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, Circle, CornerDownLeft, Inbox, Loader2, Search, Sparkles } from 'lucide-react';
import { useBranch } from '../runtime/branch-context';
import { useScreen } from '../runtime/screen-store';
import { eyebrowFor } from '../runtime/archetype';
import {
  Button,
  LoadingAnnouncement,
  RegionHeading,
  Skeleton,
  detailsOf,
  titleOf,
  usePressMotion,
  type PatternComponent,
} from './kit';

/**
 * Third-party component adapters.
 *
 * Every component here is written from scratch in CanvasCraft's own
 * token-driven pattern style — no third-party source is copied. Each is
 * *informed by* the referenced source's structure and interaction model, which
 * is why the registry record carries that source and its licence. Adding one is
 * a reviewed act (ADR 0006): the matching `RegistryRecord` names a licence and
 * a URL, and `pnpm registry:validate` fails the build otherwise.
 *
 * ── Beautiful UI (MIT) — https://www.beautifului.dev/ ───────────────────────
 *   `beautiful-ui-thinking`        a staged reasoning trace for AI surfaces
 *   `beautiful-ui-recommendation`  a grounded recommendation card
 *   `beautiful-ui-task-list`       agent task rows with status and progress
 * ── coss ui (MIT) — https://ui.coss.com/ ───────────────────────────────────
 *   `coss-ui-dialog`               dialog content layout (chrome is the shell's)
 *   `coss-ui-empty-state`          a considered empty state with recovery
 * ---------------------------------------------------------------------------
 */

/* -------------------------------------------------------------------------- */
/* Beautiful UI — thinking trace                                             */
/* -------------------------------------------------------------------------- */

const ThinkingTrace: PatternComponent = ({ region, records, placeholder }) => {
  const { manifest, container, enter, transition } = useBranch();
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <LoadingAnnouncement label={region.label || 'reasoning'} />
        <Skeleton lines={4} />
      </>
    );
  }

  const steps =
    records.length > 0
      ? records.map((record) => titleOf(record))
      : [
          `Reading ${region.label || 'the request'}`,
          'Checking the shared context',
          'Drafting a response',
        ];

  return (
    <>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <motion.ol
        className="cc-think"
        data-region={region.id}
        initial="hidden"
        animate="visible"
        variants={container}
      >
        {steps.map((step, index) => {
          const settled = index < steps.length - 1;
          return (
            <motion.li
              key={index}
              className="cc-think__step"
              data-settled={settled ? 'true' : 'false'}
              variants={enter}
              transition={transition}
              data-reveal-item
            >
              <span className="cc-think__mark" aria-hidden="true">
                {settled ? <Check /> : <Loader2 className="cc-think__spin" />}
              </span>
              <span className="cc-think__label">{step}</span>
            </motion.li>
          );
        })}
      </motion.ol>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/* Beautiful UI — recommendation card                                        */
/* -------------------------------------------------------------------------- */

const RecommendationCard: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { manifest } = useBranch();
  const press = usePressMotion(!interactive);
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <LoadingAnnouncement label={region.label || 'recommendation'} />
        <Skeleton lines={3} />
      </>
    );
  }

  const items = records.length > 0 ? records : [{ title: region.label || 'Suggested change', detail: region.purpose }];

  return (
    <>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <div className="cc-recs" data-region={region.id}>
        {items.map((record, index) => {
          const detail = detailsOf(record, 2);
          return (
            <article key={index} className="cc-rec">
              <span className="cc-rec__icon" aria-hidden="true">
                <Sparkles />
              </span>
              <div className="cc-rec__body">
                <p className="cc-rec__title">{titleOf(record)}</p>
                {detail.length > 0 ? (
                  <p className="cc-rec__detail">{detail.map(([, value]) => value).join(' · ')}</p>
                ) : null}
              </div>
              <motion.button
                type="button"
                className="cc-rec__act"
                onClick={() => interactive && onAct()}
                disabled={!interactive}
                aria-label={`Apply ${titleOf(record)}`}
                {...press}
              >
                Apply
                <ArrowRight aria-hidden="true" />
              </motion.button>
            </article>
          );
        })}
      </div>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/* Beautiful UI — agent task list                                            */
/* -------------------------------------------------------------------------- */

const STATUS_ORDER = ['done', 'running', 'queued'] as const;

function statusOf(record: Record<string, unknown>, index: number, total: number): (typeof STATUS_ORDER)[number] {
  const raw = String(record['status'] ?? record['state'] ?? '').toLowerCase();
  if (/done|complete|shipped|active/.test(raw)) return 'done';
  if (/run|progress|review/.test(raw)) return 'running';
  if (raw) return 'queued';
  // No status field: infer a plausible burndown from position.
  if (index < Math.floor(total / 2)) return 'done';
  if (index === Math.floor(total / 2)) return 'running';
  return 'queued';
}

const TaskList: PatternComponent = ({ region, records, placeholder }) => {
  const { manifest, container, enter, transition } = useBranch();
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <LoadingAnnouncement label={region.label || 'tasks'} />
        <Skeleton lines={5} />
      </>
    );
  }

  const rows = records.length > 0 ? records : [{ title: region.label || 'Task' }];

  return (
    <>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <motion.ul
        className="cc-tasks"
        data-region={region.id}
        initial="hidden"
        animate="visible"
        variants={container}
      >
        {rows.map((record, index) => {
          const status = statusOf(record, index, rows.length);
          const meta = detailsOf(record, 1)[0];
          return (
            <motion.li
              key={index}
              className="cc-task"
              data-status={status}
              variants={enter}
              transition={transition}
              data-reveal-item
            >
              <span className="cc-task__mark" aria-hidden="true">
                {status === 'done' ? <Check /> : status === 'running' ? <Loader2 className="cc-think__spin" /> : <Circle />}
              </span>
              <span className="cc-task__title">{titleOf(record)}</span>
              {meta ? <span className="cc-task__meta">{meta[1]}</span> : null}
              <span className="cc-task__status">{status}</span>
            </motion.li>
          );
        })}
      </motion.ul>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/* coss ui — dialog content                                                  */
/* -------------------------------------------------------------------------- */

const DialogContent: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { manifest } = useBranch();
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  if (placeholder) return <Skeleton lines={3} />;

  const record = records[0];
  const body = record
    ? detailsOf(record, 3)
        .map(([, value]) => value)
        .join(' ')
    : region.purpose || 'Review the details for this item and confirm.';

  return (
    <div className="cc-dlg" data-region={region.id}>
      {eyebrow ? <p className="cc-eyebrow">{eyebrow}</p> : null}
      <h2 className="cc-dlg__title">{record ? titleOf(record) : region.label || 'Details'}</h2>
      <p className="cc-dlg__body">{body}</p>
      <div className="cc-dlg__actions">
        <Button tone="quiet" onClick={() => interactive && onAct()}>
          Dismiss
        </Button>
        <Button tone="primary" onClick={() => interactive && onAct()}>
          Confirm
        </Button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* coss ui — empty state                                                     */
/* -------------------------------------------------------------------------- */

const EmptyState: PatternComponent = ({ region, placeholder, onAct, interactive }) => {
  const { manifest } = useBranch();
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  if (placeholder) return <Skeleton lines={2} />;

  return (
    <>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <div className="cc-emptyx" data-region={region.id}>
        <span className="cc-emptyx__icon" aria-hidden="true">
          <Inbox />
        </span>
        <p className="cc-emptyx__title">{region.label || 'Nothing here yet'}</p>
        <p className="cc-emptyx__body">
          {region.purpose || 'When there is something to show, it will appear in this space.'}
        </p>
        {interactive ? (
          <Button tone="primary" onClick={onAct}>
            Get started
          </Button>
        ) : null}
      </div>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/* ReUI — composer textarea (free MIT registry primitive)                    */
/* -------------------------------------------------------------------------- */

const TEXTAREA_LIMIT = 600;

const PromptTextarea: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { manifest } = useBranch();
  const { screen, dispatch } = useScreen();
  const press = usePressMotion(!interactive);
  const eyebrow = eyebrowFor(region.role, manifest.archetype);
  const fieldId = `${region.id}-textarea`;
  const [value, setValue] = useState(records[0] ? titleOf(records[0]) : '');

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <Skeleton lines={3} />
      </>
    );
  }

  // A drawn search box is a one-line control: render it as one, with the icon
  // on its own track so it can never sit on top of the placeholder.
  if (region.role === 'search-control') {
    return (
      <div className="cc-search" data-region={region.id}>
        <label className="cc-visually-hidden" htmlFor={fieldId}>
          {region.label || 'Search'}
        </label>
        <span className="cc-search__icon" aria-hidden="true">
          <Search />
        </span>
        <input
          id={fieldId}
          className="cc-input cc-search__input"
          type="search"
          placeholder={region.label || 'Search'}
          value={screen.query}
          readOnly={!interactive}
          onChange={(event) => dispatch({ type: 'set-query', query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && interactive) onAct();
          }}
        />
      </div>
    );
  }

  const hint =
    region.purpose ||
    (records[0] ? detailsOf(records[0], 1)[0]?.[1] : undefined) ||
    'Write as much as you need.';
  const count = value.length;

  return (
    <div className="cc-composer" data-region={region.id}>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <label className="cc-composer__label" htmlFor={fieldId}>
        {region.label || 'Your message'}
      </label>
      <div className="cc-composer__field">
        <textarea
          id={fieldId}
          className="cc-composer__input"
          rows={4}
          maxLength={TEXTAREA_LIMIT}
          placeholder={region.label ? `${region.label}…` : 'Start typing…'}
          value={value}
          readOnly={!interactive}
          aria-describedby={`${fieldId}-hint`}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && interactive) onAct();
          }}
        />
        <div className="cc-composer__footer">
          <span className="cc-composer__hint" id={`${fieldId}-hint`}>
            {hint}
          </span>
          <span
            className="cc-composer__count"
            data-full={count >= TEXTAREA_LIMIT ? 'true' : undefined}
          >
            {count}/{TEXTAREA_LIMIT}
          </span>
        </div>
      </div>
      <div className="cc-composer__actions">
        <span className="cc-composer__kbd" aria-hidden="true">
          <CornerDownLeft />
          ⌘↵ to send
        </span>
        <motion.button
          type="button"
          className="cc-composer__send"
          onClick={() => interactive && onAct()}
          disabled={!interactive}
          aria-label="Send message"
          {...press}
        >
          Send
          <ArrowRight aria-hidden="true" />
        </motion.button>
      </div>
    </div>
  );
};

export const ADAPTER_PATTERNS = {
  'beautiful-ui-thinking': ThinkingTrace,
  'beautiful-ui-recommendation': RecommendationCard,
  'beautiful-ui-task-list': TaskList,
  'coss-ui-dialog': DialogContent,
  'coss-ui-empty-state': EmptyState,
  'reui-textarea': PromptTextarea,
} satisfies Record<string, PatternComponent>;

export type AdapterPatternId = keyof typeof ADAPTER_PATTERNS;
