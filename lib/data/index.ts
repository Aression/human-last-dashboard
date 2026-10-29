import { dataset as demoDataset } from "../../data/demo/dataset";
import { createSelectors } from "../selectors";
import type { Dataset } from "../types";

/**
 * The single place that decides which records the app renders.
 *
 * Today that is the fictional demo fixture in `data/demo/`. Pages import their
 * selectors from here and never from a concrete dataset, so moving to curated
 * records or a database changes this module (and `loadDataset`), not the pages.
 *
 * `loadDataset` is synchronous because the demo fixture is a static import. A
 * database-backed loader will be async; when that happens this is the seam where
 * pages move to `await`ing a selector set.
 */
export function loadDataset(): Dataset {
  return demoDataset;
}

const selectors = createSelectors(loadDataset());

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
