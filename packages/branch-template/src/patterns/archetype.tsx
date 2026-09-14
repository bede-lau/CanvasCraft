import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { useBranch } from '../runtime/branch-context';
import { useScreen } from '../runtime/screen-store';
import { eyebrowFor } from '../runtime/archetype';
import {
  Button,
  EmptyMessage,
  Eyebrow,
  RegionHeading,
  Skeleton,
  Surface,
  detailsOf,
  titleOf,
  usePressMotion,
  type PatternComponent,
} from './kit';

/**
 * Archetype-native patterns.
 *
 * Every record here is CanvasCraft's own work (see the "Archetype
 * compositions" block in the registry catalogue), which is deliberate: these
 * are the five compositions a landing page, a portfolio, or an AI product
 * needs in order to stop looking like a dashboard with a different palette,
 * and there is no reason to depend on a third-party licence for the
 * difference between "good" and "generic".
 *
 * All five read `manifest.archetype` and the branch's own motion language
 * rather than hard-coding an archetype assumption, so a region can still
 * resolve to one of these when a remix or a scoped patch moves it somewhere
 * its author did not expect.
 */

/* -------------------------------------------------------------------------- */
/* Bento grid — unequal weight, one lead cell                                  */
/* -------------------------------------------------------------------------- */

const BentoGrid: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { container, enter, transition, manifest } = useBranch();
  const { dispatch, screen } = useScreen();
  const press = usePressMotion();
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <div className="cc-bento">
          {[0, 1, 2].map((index) => (
            <div key={index} className={clsx('cc-bento__cell', index === 0 && 'cc-bento__cell--lead')}>
              <Surface raised className="cc-bento__item">
                <Skeleton lines={index === 0 ? 4 : 2} />
              </Surface>
            </div>
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
      <motion.div className="cc-bento" data-region={region.id} initial="hidden" animate="visible" variants={container}>
        {records.slice(0, 5).map((record, index) => {
          const lead = index === 0;
          return (
            <motion.div
              key={index}
              className={clsx('cc-bento__cell', lead && 'cc-bento__cell--lead')}
              variants={enter}
              transition={transition}
              data-reveal-item
            >
              <Surface
                raised
                as="article"
                className={clsx('cc-bento__item', screen.selectedIndex === index && 'cc-bento__item--selected')}
              >
                <motion.button
                  type="button"
                  className="cc-bento__hit"
                  onClick={() => {
                    dispatch({ type: 'select', index });
                    if (interactive) onAct();
                  }}
                  {...press}
                >
                  <span className="cc-bento__title">{titleOf(record)}</span>
                  <ArrowUpRight className="cc-bento__go" aria-hidden="true" />
                </motion.button>
                <dl className="cc-bento__meta">
                  {detailsOf(record, lead ? 3 : 2).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </Surface>
            </motion.div>
          );
        })}
      </motion.div>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/* Display hero — the marketing argument, not the workspace label              */
/* -------------------------------------------------------------------------- */

const DisplayHero: PatternComponent = ({ region, records, placeholder, onAct, interactive }) => {
  const { hero, transition, manifest, layout, stage } = useBranch();
  if (placeholder) return <Skeleton lines={2} tall />;

  const lead = records[0];
  const proof = records.slice(1, 5);
  const words = (region.label || 'A clearer way to work').trim().split(/\s+/);
  const accentWord = words.length > 1 ? words.pop()! : '';
  const leadWords = words.join(' ');

  return (
    <motion.section
      className={clsx('cc-displayHero', layout.fullBleedHero && 'cc-displayHero--full')}
      data-region={region.id}
      initial="hidden"
      animate="visible"
      variants={hero}
      transition={transition}
    >
      {/*
        Staging, in the order a marketing hero is actually read: category,
        claim, elaboration, action, then the proof strip underneath. Each act
        waits on `stage(n)` so the eye is handed down the page one step at a
        time. Everything shares the hero variant, whose hidden state keeps
        opacity at 1 — the headline is this page's LCP element and must never be
        invisible while it waits its turn.
      */}
      <div className="cc-displayHero__body" data-parallax-layer>
        <motion.div variants={hero} transition={{ ...transition, delay: stage(0) }}>
          <Eyebrow>{manifest.palette.name}</Eyebrow>
        </motion.div>
        <motion.h1
          className="cc-heading cc-heading--display cc-displayHero__headline"
          variants={hero}
          transition={{ ...transition, delay: stage(1) }}
        >
          {leadWords ? `${leadWords} ` : null}
          {accentWord ? <span className="cc-displayHero__accent">{accentWord}</span> : null}
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
              Get started
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button tone="quiet" onClick={onAct}>
              See how it works
            </Button>
          </motion.div>
        ) : null}
      </div>
      {proof.length > 0 ? (
        <motion.ul
          className="cc-displayHero__proof"
          variants={hero}
          transition={{ ...transition, delay: stage(4) }}
        >
          {proof.map((record, index) => (
            <li key={index}>{titleOf(record)}</li>
          ))}
        </motion.ul>
      ) : null}
    </motion.section>
  );
};

/* -------------------------------------------------------------------------- */
/* Marquee — continuous proof strip                                            */
/* -------------------------------------------------------------------------- */

const Marquee: PatternComponent = ({ region, records, placeholder }) => {
  if (placeholder) return <Skeleton lines={1} />;
  const items = records.length > 0 ? records : [{ title: 'Featured' }, { title: 'Selected' }, { title: 'Recent' }];
  // Duplicated once for a seamless loop: the track scrolls exactly one copy's
  // width, so the join between the two is invisible. `aria-hidden` on the
  // repeat keeps assistive technology from reading the row twice.
  const loop = [...items, ...items];

  return (
    <div className="cc-marquee" data-region={region.id} aria-label={region.label || 'Highlights'}>
      <div className="cc-marquee__track">
        {loop.map((record, index) => (
          <span className="cc-marquee__item" key={index} aria-hidden={index >= items.length}>
            {titleOf(record)}
          </span>
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Aurora panel — a glass statement lit from behind                            */
/* -------------------------------------------------------------------------- */

function AuroraGlass({
  record,
  purpose,
  heading,
}: {
  record: Parameters<typeof titleOf>[0] | undefined;
  purpose: string;
  /** Rendered first inside `.cc-aurora__inner`, above the glow — only the
      single-panel case (one panel *is* the region) passes this; a grid of
      several panels shows the heading once, above the whole grid, instead. */
  heading?: ReactNode;
}) {
  const body = record ? titleOf(record) : purpose;
  const details = record ? detailsOf(record, 2) : [];
  return (
    <>
      <div className="cc-aurora__glow" aria-hidden="true" />
      {/* The text layer sits on an opaque surface fill of its own, so contrast
          holds no matter where the glow behind it has drifted to. */}
      <div className="cc-aurora__inner">
        {heading}
        <p className="cc-text__body">{body}</p>
        {details.length > 0 ? (
          <dl className="cc-aurora__meta">
            {details.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </>
  );
}

const AuroraPanel: PatternComponent = ({ region, records, placeholder }) => {
  const { manifest } = useBranch();
  if (placeholder) return <Skeleton lines={3} tall />;
  const eyebrow = eyebrowFor(region.role, manifest.archetype);

  // A role like `insight-card` can carry several distinct records — several
  // proof points, several highlights — and a single glass panel can only
  // ever show one of them. `records[0]` alone silently dropped the rest;
  // more than one record now gets a panel each, laid out in the same grid
  // the card patterns use, so nothing is lost regardless of how many
  // records this region ends up with.
  if (records.length > 1) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <div className="cc-cards" data-region={region.id}>
          {records.map((record, index) => (
            <Surface key={index} raised className="cc-aurora">
              <AuroraGlass record={record} purpose={region.purpose} />
            </Surface>
          ))}
        </div>
      </>
    );
  }

  return (
    <Surface raised className="cc-aurora" data-region={region.id}>
      <AuroraGlass
        record={records[0]}
        purpose={region.purpose}
        heading={<RegionHeading region={region} eyebrow={eyebrow} />}
      />
    </Surface>
  );
};

/* -------------------------------------------------------------------------- */
/* Stream output — model output arriving progressively                         */
/* -------------------------------------------------------------------------- */

function StreamBody({
  record,
  purpose,
  durationS,
  reducedMotion,
}: {
  record: Parameters<typeof titleOf>[0] | undefined;
  purpose: string;
  durationS: number;
  reducedMotion: boolean;
}) {
  const body = record ? titleOf(record) : purpose;
  return (
    // The full text is in the DOM on the first frame — `clip-path` is a
    // purely visual mask, so a screen reader announces the complete
    // sentence immediately rather than word by word.
    <motion.p
      className="cc-stream__body"
      initial={reducedMotion ? false : { clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      transition={reducedMotion ? { duration: 0 } : { duration: durationS, ease: 'linear' }}
    >
      {body}
      <span className="cc-stream__caret" aria-hidden="true" />
    </motion.p>
  );
}

const StreamOutput: PatternComponent = ({ region, records, placeholder }) => {
  const { reducedMotion, manifest } = useBranch();
  const eyebrow = eyebrowFor(region.role, manifest.archetype);
  if (placeholder) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <Skeleton lines={3} />
      </>
    );
  }

  const durationS = Math.min(2.4, Math.max(0.6, manifest.motion.durationMs / 260));

  // Same reasoning as AuroraPanel: `records[0]` alone silently dropped every
  // record past the first for a role (`insight-card`) that can carry several.
  if (records.length > 1) {
    return (
      <>
        <RegionHeading region={region} eyebrow={eyebrow} />
        <div className="cc-cards" data-region={region.id}>
          {records.map((record, index) => (
            <Surface key={index} raised className="cc-stream">
              <StreamBody record={record} purpose={region.purpose} durationS={durationS} reducedMotion={reducedMotion} />
            </Surface>
          ))}
        </div>
      </>
    );
  }

  return (
    <Surface raised className="cc-stream" data-region={region.id}>
      <RegionHeading region={region} eyebrow={eyebrow} />
      <StreamBody record={records[0]} purpose={region.purpose} durationS={durationS} reducedMotion={reducedMotion} />
    </Surface>
  );
};

export const ARCHETYPE_PATTERNS = {
  'canvascraft-bento-grid': BentoGrid,
  'canvascraft-display-hero': DisplayHero,
  'canvascraft-logo-marquee': Marquee,
  'canvascraft-aurora-panel': AuroraPanel,
  'canvascraft-stream-output': StreamOutput,
} satisfies Record<string, PatternComponent>;
