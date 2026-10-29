import type {
  AssessmentStatus,
  ClaimType,
  EvidenceType,
  ForecastStatus,
  Polarity,
  Provenance,
  ReviewStatus,
  SourceTier,
  SourceType,
} from "./types";

export const provenanceLabel: Record<Provenance, string> = {
  demo: "Demo (fictional)",
  curated: "Curated",
};

export const claimTypeLabel: Record<ClaimType, string> = {
  "observed-fact": "Observed fact",
  "author-interpretation": "Author interpretation",
  forecast: "Forecast",
  speculation: "Speculation",
};

export const assessmentStatusLabel: Record<AssessmentStatus, string> = {
  unverified: "Unverified",
  partial: "Partial",
  "demonstrated-under-conditions": "Demonstrated under conditions",
  "independently-reproduced": "Independently reproduced",
  contradicted: "Contradicted",
  "insufficient-evidence": "Insufficient evidence",
};

export const polarityLabel: Record<Polarity, string> = {
  supports: "Supports",
  contradicts: "Contradicts",
  qualifies: "Qualifies",
  contextualizes: "Contextualizes",
};

export const reviewStatusLabel: Record<ReviewStatus, string> = {
  unreviewed: "Unreviewed",
  accepted: "Accepted",
  rejected: "Rejected",
  "needs-follow-up": "Needs follow-up",
};

export const sourceTierLabel: Record<SourceTier, string> = {
  primary: "Primary",
  independent: "Independent",
  lead: "Lead",
};

export const sourceTypeLabel: Record<SourceType, string> = {
  paper: "Paper",
  "technical-report": "Technical report",
  benchmark: "Benchmark",
  repository: "Repository",
  experiment: "Experiment",
  announcement: "Announcement",
  discussion: "Discussion",
  other: "Other",
};

export const evidenceTypeLabel: Record<EvidenceType, string> = {
  "direct-result": "Direct result",
  reproduction: "Reproduction",
  "independent-evaluation": "Independent evaluation",
  "benchmark-result": "Benchmark result",
  "code-inspection": "Code inspection",
  "expert-analysis": "Expert analysis",
  other: "Other",
};

export const forecastStatusLabel: Record<ForecastStatus, string> = {
  open: "Open",
  "resolved-true": "Resolved true",
  "resolved-false": "Resolved false",
  ambiguous: "Ambiguous",
  expired: "Expired",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
