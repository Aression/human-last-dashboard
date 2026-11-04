import { getDictionary, type Locale } from "./i18n";
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

export function formatDate(iso: string | null, locale: Locale = "en"): string {
  if (!iso) return getDictionary(locale).common.unknownDate;
  // Dataset fields are date-only ("2026-03-01"); automation records carry full
  // timestamps ("2026-11-04T10:18:07.957Z"). Appending a time to the latter
  // produced "Invalid Date" on the automation page, so both shapes are parsed
  // and an unparseable value is reported as unknown rather than rendered raw.
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return getDictionary(locale).common.unknownDate;
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
