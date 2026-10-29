/**
 * Domain types for the dashboard. These mirror docs/evidence-model.md.
 * Fields marked "UI extension" are additions made for the presentation layer;
 * they are documented in docs/evidence-model.md.
 */

/** Where a record came from. Everything in this repository today is "demo". */
export type Provenance = "demo" | "curated";

/** Present on records produced by a model; absent on human-entered records. */
export interface GeneratedBy {
  model: string;
  workflow_version: string;
}

export interface BaseRecord {
  id: string;
  provenance: Provenance;
  created_at: string; // ISO date
  generated_by?: GeneratedBy;
}

// ---------- Source ----------

export type SourceType =
  | "paper"
  | "technical-report"
  | "benchmark"
  | "repository"
  | "experiment"
  | "announcement"
  | "discussion"
  | "other";

export type SourceTier = "primary" | "independent" | "lead";
export type SourceStatus = "candidate" | "reviewed" | "unavailable" | "rejected";

export interface Source extends BaseRecord {
  canonical_url: string | null; // null for demo sources: no URL was observed
  title: string;
  publisher: string;
  authors: string[];
  published_at: string | null;
  retrieved_at: string | null;
  source_type: SourceType;
  source_tier: SourceTier;
  /** UI extension: the reporting party built or operates the system being reported on. */
  developer_affiliated: boolean;
  content_hash: string | null;
  status: SourceStatus;
}

// ---------- Claim ----------

export type ClaimType =
  | "observed-fact"
  | "author-interpretation"
  | "forecast"
  | "speculation";

export type ExtractionStatus =
  | "candidate"
  | "source-supported"
  | "unsupported"
  | "reviewed";

export interface Claim extends BaseRecord {
  source_id: string;
  statement: string;
  claim_type: ClaimType;
  source_span: string;
  conditions: string;
  limitations: string;
  extraction_status: ExtractionStatus;
}

// ---------- Evidence ----------

export type EvidenceType =
  | "direct-result"
  | "reproduction"
  | "independent-evaluation"
  | "benchmark-result"
  | "code-inspection"
  | "expert-analysis"
  | "other";

export type Polarity = "supports" | "contradicts" | "qualifies" | "contextualizes";
export type ReviewStatus = "unreviewed" | "accepted" | "rejected" | "needs-follow-up";

export interface Evidence extends BaseRecord {
  source_id: string;
  evidence_type: EvidenceType;
  polarity: Polarity;
  observation: string;
  method: string;
  limitations: string;
  reproducibility_notes: string;
  review_status: ReviewStatus;
  claim_ids: string[];
  capability_ids: string[];
}

// ---------- Capability & Assessment ----------

export type Level = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";

export interface Criterion {
  id: string;
  text: string;
}

export interface Capability {
  id: string;
  name: string;
  description: string;
  level: Level;
  criteria: Criterion[];
  nonCriteria: string[];
  knownBottlenecks: string[];
}

export type AssessmentStatus =
  | "unverified"
  | "partial"
  | "demonstrated-under-conditions"
  | "independently-reproduced"
  | "contradicted"
  | "insufficient-evidence";

export interface Assessment extends BaseRecord {
  capability_id: string;
  version: number;
  /** Version of the capability definitions this assessment was made under. */
  taxonomy_version: string;
  status: AssessmentStatus;
  /** Qualitative; see docs/stage-taxonomy.md. No numeric score is implied. */
  confidence: "low" | "moderate" | "high";
  supporting_evidence_ids: string[];
  counterevidence_ids: string[];
  conditions: string;
  limitations: string;
  rationale: string;
  reviewer: string;
  reviewed_at: string;
  supersedes_assessment_id: string | null;
}

/** A proposed status change that has not (or not yet) passed the review gate. */
export interface AssessmentProposal extends BaseRecord {
  capability_id: string;
  from_status: AssessmentStatus;
  to_status: AssessmentStatus;
  rationale: string;
  supporting_evidence_ids: string[];
  counterevidence_ids: string[];
  /** Gate checklist items a human has recorded; the rest are derived from evidence. */
  recorded: Partial<Record<GateItemId, string>>;
}

export type GateItemId =
  | "criterion"
  | "direct-evidence"
  | "conditions-baseline"
  | "human-intervention"
  | "replication"
  | "counterevidence"
  | "generalization"
  | "reviewer-decision";

// ---------- Events, Attribution, Forecast ----------

export interface ObservedEvent extends BaseRecord {
  title: string;
  occurred_at: string;
  description: string;
  capability_ids: string[];
  evidence_ids: string[];
}

export interface Attribution extends BaseRecord {
  event_id: string;
  hypothesis: string;
  mechanism: string;
  supporting_evidence_ids: string[];
  counterevidence_ids: string[];
  alternatives: string[];
  assumptions: string[];
  discriminating_tests: string[];
  confidence: "low" | "moderate" | "high";
  status: "open" | "weakened" | "retained";
}

export type ForecastStatus =
  | "open"
  | "resolved-true"
  | "resolved-false"
  | "ambiguous"
  | "expired";

export interface Forecast extends BaseRecord {
  statement: string;
  resolution_date: string;
  resolution_criteria: string;
  probability: number | null;
  rationale: string;
  evidence_ids: string[];
  status: ForecastStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
}

export interface OpenQuestion {
  id: string;
  provenance: Provenance;
  question: string;
  blocking: string;
  capability_ids: string[];
}

export interface Dataset {
  label: string;
  /** Version of `capabilities`; see TAXONOMY_VERSION in data/capabilities.ts. */
  taxonomy_version: string;
  sources: Source[];
  claims: Claim[];
  evidence: Evidence[];
  capabilities: Capability[];
  assessments: Assessment[];
  proposals: AssessmentProposal[];
  events: ObservedEvent[];
  attributions: Attribution[];
  forecasts: Forecast[];
  questions: OpenQuestion[];
}
