import { evaluateGate } from "./gate";
import type {
  Assessment,
  Capability,
  Claim,
  Dataset,
  Evidence,
  Forecast,
  Polarity,
  ReviewStatus,
  Source,
  SourceTier,
} from "./types";

/**
 * Order in which evidence is drawn wherever it is grouped by direction, so the
 * same pattern reads the same way on every chart: what supports a capability
 * and what contradicts it sit next to each other, and context comes last.
 */
export const POLARITY_ORDER: readonly Polarity[] = [
  "supports",
  "contradicts",
  "qualifies",
  "contextualizes",
];

export const REVIEW_ORDER: readonly ReviewStatus[] = [
  "accepted",
  "unreviewed",
  "needs-follow-up",
  "rejected",
];

export const TIER_ORDER: readonly SourceTier[] = ["primary", "independent", "lead"];

/** One evidence record as a chart needs it: enough to draw and label a unit. */
export interface EvidenceUnit {
  id: string;
  polarity: Polarity;
  review_status: ReviewStatus;
}

/** One source as a chart needs it. */
export interface SourceUnit {
  id: string;
  title: string;
  tier: SourceTier;
  developerAffiliated: boolean;
}

/**
 * Read path over a `Dataset`. Nothing here imports a concrete dataset: pages get
 * their selectors from `lib/data`, which decides where the records come from.
 * Swapping the demo fixture for curated records (or, later, a database loader)
 * therefore changes one module instead of every selector.
 */

export interface ActivityItem {
  date: string;
  kind: "event" | "assessment" | "forecast";
  title: string;
  detail: string;
  href: string;
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

export function createSelectors(ds: Dataset) {
  const sourcesById = byId(ds.sources);
  const claimsById = byId(ds.claims);
  const evidenceById = byId(ds.evidence);
  const capabilitiesById = byId(ds.capabilities);
  const assessmentsById = byId(ds.assessments);
  const eventsById = byId(ds.events);

  function sourceOf(e: { source_id: string }): Source {
    const s = sourcesById.get(e.source_id);
    if (!s) throw new Error(`Dangling source reference: ${e.source_id}`);
    return s;
  }

  /** All versions of a capability's assessment, newest first. */
  function assessmentHistory(capabilityId: string): Assessment[] {
    return ds.assessments
      .filter((a) => a.capability_id === capabilityId)
      .sort((a, b) => b.version - a.version);
  }

  function currentAssessment(capabilityId: string): Assessment | null {
    return assessmentHistory(capabilityId)[0] ?? null;
  }

  function evidenceForCapability(capabilityId: string): Evidence[] {
    return ds.evidence.filter((e) => e.capability_ids.includes(capabilityId));
  }

  function proposalsFor(capabilityId: string) {
    return ds.proposals.filter((p) => p.capability_id === capabilityId);
  }

  function claimsForEvidence(e: Evidence): Claim[] {
    return e.claim_ids.map((id) => claimsById.get(id)).filter((c): c is Claim => Boolean(c));
  }

  function evidenceForClaim(claimId: string): Evidence[] {
    return ds.evidence.filter((e) => e.claim_ids.includes(claimId));
  }

  function relatedForecasts(evidenceId: string): Forecast[] {
    return ds.forecasts.filter((f) => f.evidence_ids.includes(evidenceId));
  }

  function capabilityCapabilities(ids: string[]): Capability[] {
    return ids.map((id) => capabilitiesById.get(id)).filter((c): c is Capability => Boolean(c));
  }

  // -------------------------------------------------------------- overview

  function recentActivity(limit = 8): ActivityItem[] {
    const items: ActivityItem[] = [
      ...ds.events.map<ActivityItem>((e) => ({
        date: e.occurred_at,
        kind: "event",
        title: e.title,
        detail: e.description,
        href: `/research#${e.id}`,
      })),
      ...ds.assessments
        .filter((a) => a.version > 1)
        .map<ActivityItem>((a) => {
          const prev = a.supersedes_assessment_id
            ? assessmentsById.get(a.supersedes_assessment_id)
            : null;
          const cap = capabilitiesById.get(a.capability_id);
          return {
            date: a.reviewed_at,
            kind: "assessment",
            title: `${cap?.level} assessment revised to v${a.version}`,
            detail: `${prev?.status ?? "none"} → ${a.status}`,
            href: `/progress/${a.capability_id}`,
          };
        }),
      ...ds.forecasts
        .filter((f) => f.resolved_at)
        .map<ActivityItem>((f) => ({
          date: f.resolved_at as string,
          kind: "forecast",
          title: `Forecast ${f.id} ${f.status.replace("resolved-", "resolved ")}`,
          detail: f.statement,
          href: `/research#${f.id}`,
        })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  }

  function pendingReviews() {
    return ds.proposals.map((p) => ({
      proposal: p,
      capability: capabilitiesById.get(p.capability_id) as Capability,
      gate: evaluateGate(p, ds),
    }));
  }

  function activeBottlenecks() {
    return ds.capabilities.flatMap((c) =>
      c.knownBottlenecks.map((b) => ({ capability: c, bottleneck: b })),
    );
  }

  function evidenceStats() {
    const total = ds.evidence.length;
    const unreviewed = ds.evidence.filter(
      (e) => e.review_status === "unreviewed" || e.review_status === "needs-follow-up",
    ).length;
    const claimsUnderReview = ds.claims.filter(
      (c) => c.extraction_status === "candidate" || c.extraction_status === "unsupported",
    ).length;
    return {
      total,
      unreviewed,
      claimsUnderReview,
      assessmentRevisions: ds.assessments.filter((a) => a.version > 1).length,
      openForecasts: ds.forecasts.filter((f) => f.status === "open").length,
      resolvedForecasts: ds.forecasts.filter((f) => f.status.startsWith("resolved")).length,
    };
  }

  /** Counts of evidence by polarity, split by review state, for the tally glyph. */
  function tallyFor(capabilityId: string) {
    const items = evidenceForCapability(capabilityId);
    return items.map((e) => ({
      id: e.id,
      polarity: e.polarity,
      reviewed: e.review_status === "accepted",
      status: e.review_status,
    }));
  }

  // ---------------------------------------------------------------- charts
  //
  // Everything below returns plain counts and units. None of it maps a count to
  // a percentage or a score: a chart built on it draws one mark per record.

  const toUnit = (e: Evidence): EvidenceUnit => ({
    id: e.id,
    polarity: e.polarity,
    review_status: e.review_status,
  });

  const polarityRank = (p: Polarity) => POLARITY_ORDER.indexOf(p);

  function emptyPolarityCounts(): Record<Polarity, number> {
    return { supports: 0, contradicts: 0, qualifies: 0, contextualizes: 0 };
  }

  /**
   * Evidence per capability, ordered by direction. A record linked to several
   * capabilities appears in each of their rows, so the rows do not sum to the
   * number of records; `evidenceMix` is the once-per-record view.
   */
  function evidenceByCapability() {
    return ds.capabilities.map((capability) => {
      const items = evidenceForCapability(capability.id)
        .map(toUnit)
        .sort((a, b) => polarityRank(a.polarity) - polarityRank(b.polarity) || a.id.localeCompare(b.id));
      const counts = emptyPolarityCounts();
      for (const item of items) counts[item.polarity] += 1;
      return { capability, items, counts };
    });
  }

  /** Every evidence record once, grouped by direction, plus how many are accepted. */
  function evidenceMix() {
    const units = ds.evidence
      .map(toUnit)
      .sort((a, b) => polarityRank(a.polarity) - polarityRank(b.polarity) || a.id.localeCompare(b.id));
    const polarity = emptyPolarityCounts();
    const review: Record<ReviewStatus, number> = {
      accepted: 0,
      unreviewed: 0,
      "needs-follow-up": 0,
      rejected: 0,
    };
    for (const unit of units) {
      polarity[unit.polarity] += 1;
      review[unit.review_status] += 1;
    }
    const largestGroup = Math.max(0, ...POLARITY_ORDER.map((p) => polarity[p]));
    return { total: units.length, units, polarity, review, largestGroup };
  }

  /** Sources by tier, keeping developer affiliation, because the two answer different questions. */
  function sourceBase() {
    const units: SourceUnit[] = ds.sources.map((s) => ({
      id: s.id,
      title: s.title,
      tier: s.source_tier,
      developerAffiliated: s.developer_affiliated,
    }));
    const tiers = TIER_ORDER.map((tier) => {
      const inTier = units
        .filter((u) => u.tier === tier)
        .sort((a, b) => Number(a.developerAffiliated) - Number(b.developerAffiliated) || a.id.localeCompare(b.id));
      return { tier, units: inTier };
    });
    return {
      total: units.length,
      tiers,
      independentTier: units.filter((u) => u.tier === "independent").length,
      developerAffiliated: units.filter((u) => u.developerAffiliated).length,
    };
  }

  return {
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
    evidenceByCapability,
    evidenceMix,
    sourceBase,
  };
}

export type Selectors = ReturnType<typeof createSelectors>;
