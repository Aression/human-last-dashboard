import { evaluateGate } from "./gate";
import type {
  Assessment,
  Capability,
  Claim,
  Dataset,
  Evidence,
  Forecast,
  Source,
} from "./types";

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
  };
}

export type Selectors = ReturnType<typeof createSelectors>;
