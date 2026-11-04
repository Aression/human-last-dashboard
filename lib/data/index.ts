import { CAPABILITIES, TAXONOMY_VERSION } from "../../data/capabilities";
import curatedRecords from "../../data/curated/records.json";
import {
  assertValidOverlay,
  localizeDataset,
  type RecordLocale,
} from "../records-i18n";
import { createSelectors, type Selectors } from "../selectors";
import type { Dataset } from "../types";
import { assertValidDataset } from "../validate";

/**
 * The single place that decides which records the app renders.
 *
 * The app renders the agent-maintained curated records in
 * `data/curated/records.json`. That file holds every collection except
 * `capabilities`: the taxonomy is framework content and stays single-sourced in
 * `data/capabilities.ts`, so editing a criterion cannot leave a stale copy in the
 * data file. The two are composed here and validated once, at module load, so a
 * broken dataset fails the build instead of rendering an inconsistent dashboard.
 *
 * Pages import their selectors from here and never from a concrete dataset.
 * `loadDataset` is synchronous because the records are a static JSON import; a
 * database-backed loader will be async, and this is the seam where pages move to
 * `await`ing a selector set.
 */

/** The published shape: every `Dataset` collection except the taxonomy. */
type CuratedRecords = Omit<Dataset, "capabilities">;

const records = curatedRecords as unknown as CuratedRecords;

if (records.taxonomy_version !== TAXONOMY_VERSION) {
  throw new Error(
    `data/curated/records.json is pinned to taxonomy ${JSON.stringify(
      records.taxonomy_version,
    )}, but data/capabilities.ts is on ${JSON.stringify(
      TAXONOMY_VERSION,
    )}; re-assess the records under the current taxonomy before publishing`,
  );
}

const dataset: Dataset = { ...records, capabilities: CAPABILITIES };

// Every record must be curated: demo fixtures live in data/demo/ and are test
// fixtures only, never what the app renders (AGENTS.md rule 10).
assertValidDataset(dataset, { expectedProvenance: "curated" });

// The translation overlay is checked against these records, so an entry whose
// record was removed fails the build instead of quietly disappearing.
assertValidOverlay(dataset);

export function loadDataset(): Dataset {
  return dataset;
}

const selectors = createSelectors(dataset);

/**
 * Selectors over the records with `locale`'s translations applied.
 *
 * `en` is the published text itself, so the English site renders exactly what
 * is committed. Other locales are built once and memoised: the dataset is a
 * static import, so there is nothing to invalidate within a process.
 */
const selectorsByLocale = new Map<RecordLocale, Selectors>([["en", selectors]]);

export function selectorsFor(locale: RecordLocale): Selectors {
  const cached = selectorsByLocale.get(locale);
  if (cached) return cached;
  const localized = createSelectors(localizeDataset(dataset, locale));
  selectorsByLocale.set(locale, localized);
  return localized;
}

export const {
  ds,
  sourcesById,
  claimsById,
  evidenceById,
  capabilitiesById,
  assessmentsById,
  eventsById,
  sourceOf,
  assessmentHistory,
  currentAssessment,
  evidenceForCapability,
  proposalsFor,
  claimsForEvidence,
  evidenceForClaim,
  relatedForecasts,
  capabilityCapabilities,
  recentActivity,
  pendingReviews,
  activeBottlenecks,
  evidenceStats,
  tallyFor,
} = selectors;

export type { ActivityItem, Selectors } from "../selectors";
