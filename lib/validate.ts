import type {
  Assessment,
  AssessmentProposal,
  Attribution,
  Capability,
  Claim,
  Dataset,
  Evidence,
  Forecast,
  ObservedEvent,
  OpenQuestion,
  Source,
} from "./types";

/**
 * Hand-written runtime validation for a dataset.
 *
 * Types from ./types only protect compile-time shapes; records loaded from JSON
 * (roadmap step 3, the ingestion pipeline) can still have dangling references,
 * broken version chains, or a forecast that claims a resolution it never
 * recorded. These checks are therefore about integrity, not formatting:
 *
 *  - ids are unique within their collection and carry the expected prefix;
 *  - every foreign key resolves;
 *  - assessment versions form a single unbroken chain per capability;
 *  - timestamps are ISO dates (date-only or full timestamps);
 *  - demo provenance never claims an observed URL or content hash
 *    (AGENTS.md rules 2 and 10);
 *  - a resolved forecast records when and why it resolved, an open one records
 *    neither;
 *  - capabilities have unique criteria, and gate items recorded on a proposal
 *    are real GateItemIds.
 *
 * `validateDataset` aggregates every violation it finds; nothing short-circuits.
 */

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

type Err = (message: string) => void;

const setOf = (values: readonly string[]) => new Set<string>(values);

const PROVENANCES = setOf(["demo", "curated"]);
const SOURCE_TYPES = setOf([
  "paper",
  "technical-report",
  "benchmark",
  "repository",
  "experiment",
  "announcement",
  "discussion",
  "other",
]);
const SOURCE_TIERS = setOf(["primary", "independent", "lead"]);
const SOURCE_STATUSES = setOf(["candidate", "reviewed", "unavailable", "rejected"]);
const CLAIM_TYPES = setOf([
  "observed-fact",
  "author-interpretation",
  "forecast",
  "speculation",
]);
const EXTRACTION_STATUSES = setOf([
  "candidate",
  "source-supported",
  "unsupported",
  "reviewed",
]);
const EVIDENCE_TYPES = setOf([
  "direct-result",
  "reproduction",
  "independent-evaluation",
  "benchmark-result",
  "code-inspection",
  "expert-analysis",
  "other",
]);
const POLARITIES = setOf(["supports", "contradicts", "qualifies", "contextualizes"]);
const REVIEW_STATUSES = setOf([
  "unreviewed",
  "accepted",
  "rejected",
  "needs-follow-up",
]);
const LEVELS = setOf(["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"]);
const ASSESSMENT_STATUSES = setOf([
  "unverified",
  "partial",
  "demonstrated-under-conditions",
  "independently-reproduced",
  "contradicted",
  "insufficient-evidence",
]);
const CONFIDENCES = setOf(["low", "moderate", "high"]);
const ATTRIBUTION_STATUSES = setOf(["open", "weakened", "retained"]);
const FORECAST_STATUSES = setOf([
  "open",
  "resolved-true",
  "resolved-false",
  "ambiguous",
  "expired",
]);
const RESOLVED_FORECAST_STATUSES = setOf(["resolved-true", "resolved-false"]);

const GATE_ITEM_IDS = setOf([
  "criterion",
  "direct-evidence",
  "conditions-baseline",
  "human-intervention",
  "replication",
  "counterevidence",
  "generalization",
  "reviewer-decision",
]);

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

function checkDate(
  kind: string,
  id: string,
  field: string,
  value: unknown,
  nullable: boolean,
  err: Err,
): void {
  if (value === null && nullable) return;
  if (!isIsoDate(value)) {
    err(
      `${kind} ${id}: ${field} must be an ISO date${nullable ? " or null" : ""}, got ${JSON.stringify(value)}`,
    );
  }
}

function checkEnum(
  kind: string,
  id: string,
  field: string,
  value: unknown,
  allowed: ReadonlySet<string>,
  err: Err,
): void {
  if (typeof value !== "string" || !allowed.has(value)) {
    err(`${kind} ${id}: ${field} has unexpected value ${JSON.stringify(value)}`);
  }
}

function checkRefs(
  kind: string,
  id: string,
  field: string,
  ids: unknown,
  allowed: ReadonlySet<string>,
  err: Err,
): void {
  if (!Array.isArray(ids)) {
    err(`${kind} ${id}: ${field} must be an array`);
    return;
  }
  ids.forEach((ref: unknown, index) => {
    if (typeof ref !== "string") {
      err(`${kind} ${id}: ${field}[${index}] must be a string`);
      return;
    }
    if (!allowed.has(ref)) {
      err(`${kind} ${id}: ${field} references unknown id ${JSON.stringify(ref)}`);
    }
  });
}

function checkBaseProvenance(
  kind: string,
  id: string,
  provenance: unknown,
  createdAt: unknown,
  err: Err,
): void {
  checkEnum(kind, id, "provenance", provenance, PROVENANCES, err);
  checkDate(kind, id, "created_at", createdAt, false, err);
}

/** Collects ids, flagging duplicates and wrong prefixes. */
function idIndex(
  kind: string,
  items: ReadonlyArray<{ id: string }>,
  prefix: string,
  err: Err,
): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const id: unknown = item?.id;
    if (typeof id !== "string" || !id.startsWith(prefix) || id.length === prefix.length) {
      err(
        `${kind}[${index}]: id must be a string starting with "${prefix}" and a non-empty suffix, got ${JSON.stringify(id)}`,
      );
      return;
    }
    if (ids.has(id)) {
      err(`${kind} ${id}: duplicate id`);
      return;
    }
    ids.add(id);
  });
  return ids;
}

function asArray<T>(items: unknown, kind: string, err: Err): T[] {
  if (!Array.isArray(items)) {
    err(`dataset.${kind}s: expected an array`);
    return [];
  }
  return items as T[];
}

export function validateDataset(ds: Dataset): string[] {
  const errors: string[] = [];
  const err: Err = (message) => errors.push(message);

  if (!ds || typeof ds !== "object") {
    return ["dataset: expected an object"];
  }
  if (typeof ds.label !== "string" || !ds.label.trim()) {
    err("dataset: label must be a non-empty string");
  }

  const sources = asArray<Source>(ds.sources, "source", err);
  const claims = asArray<Claim>(ds.claims, "claim", err);
  const evidence = asArray<Evidence>(ds.evidence, "evidence", err);
  const capabilities = asArray<Capability>(ds.capabilities, "capability", err);
  const assessments = asArray<Assessment>(ds.assessments, "assessment", err);
  const proposals = asArray<AssessmentProposal>(ds.proposals, "proposal", err);
  const events = asArray<ObservedEvent>(ds.events, "event", err);
  const attributions = asArray<Attribution>(ds.attributions, "attribution", err);
  const forecasts = asArray<Forecast>(ds.forecasts, "forecast", err);
  const questions = asArray<OpenQuestion>(ds.questions, "question", err);

  const sourceIds = idIndex("source", sources, "s-", err);
  const claimIds = idIndex("claim", claims, "c-", err);
  const evidenceIds = idIndex("evidence", evidence, "e-", err);
  const capabilityIds = idIndex("capability", capabilities, "cap-", err);
  const assessmentIds = idIndex("assessment", assessments, "a-", err);
  idIndex("proposal", proposals, "p-", err);
  const eventIds = idIndex("event", events, "ev-", err);
  idIndex("attribution", attributions, "at-", err);
  idIndex("forecast", forecasts, "f-", err);
  idIndex("question", questions, "q-", err);

  // ---------------------------------------------------------------- sources
  for (const s of sources) {
    checkBaseProvenance("source", s.id, s.provenance, s.created_at, err);
    checkEnum("source", s.id, "source_type", s.source_type, SOURCE_TYPES, err);
    checkEnum("source", s.id, "source_tier", s.source_tier, SOURCE_TIERS, err);
    checkEnum("source", s.id, "status", s.status, SOURCE_STATUSES, err);
    checkDate("source", s.id, "published_at", s.published_at, true, err);
    checkDate("source", s.id, "retrieved_at", s.retrieved_at, true, err);
    if (!Array.isArray(s.authors) || s.authors.some((a) => typeof a !== "string")) {
      err(`source ${s.id}: authors must be an array of strings`);
    }
    if (s.provenance === "demo") {
      if (s.canonical_url !== null) {
        err(`source ${s.id}: demo provenance must not claim an observed canonical_url (AGENTS.md rule 2)`);
      }
      if (s.content_hash !== null) {
        err(`source ${s.id}: demo provenance must not claim an observed content_hash (AGENTS.md rule 2)`);
      }
    }
    if (s.canonical_url === null && s.content_hash !== null) {
      err(`source ${s.id}: content_hash is set but canonical_url is null`);
    }
  }

  // ----------------------------------------------------------------- claims
  for (const c of claims) {
    checkBaseProvenance("claim", c.id, c.provenance, c.created_at, err);
    checkEnum("claim", c.id, "claim_type", c.claim_type, CLAIM_TYPES, err);
    checkEnum("claim", c.id, "extraction_status", c.extraction_status, EXTRACTION_STATUSES, err);
    checkRefs("claim", c.id, "source_id", [c.source_id], sourceIds, err);
  }

  // --------------------------------------------------------------- evidence
  for (const e of evidence) {
    checkBaseProvenance("evidence", e.id, e.provenance, e.created_at, err);
    checkEnum("evidence", e.id, "evidence_type", e.evidence_type, EVIDENCE_TYPES, err);
    checkEnum("evidence", e.id, "polarity", e.polarity, POLARITIES, err);
    checkEnum("evidence", e.id, "review_status", e.review_status, REVIEW_STATUSES, err);
    checkRefs("evidence", e.id, "source_id", [e.source_id], sourceIds, err);
    checkRefs("evidence", e.id, "claim_ids", e.claim_ids, claimIds, err);
    checkRefs("evidence", e.id, "capability_ids", e.capability_ids, capabilityIds, err);
  }

  // ----------------------------------------------------------- capabilities
  const criterionIds = new Set<string>();
  for (const c of capabilities) {
    checkEnum("capability", c.id, "level", c.level, LEVELS, err);
    if (!Array.isArray(c.criteria) || c.criteria.length === 0) {
      err(`capability ${c.id}: criteria must be a non-empty array`);
      continue;
    }
    for (const criterion of c.criteria) {
      const criterionId: unknown = criterion?.id;
      if (typeof criterionId !== "string" || !criterionId.startsWith("crit-")) {
        err(
          `capability ${c.id}: criterion id must be a string starting with "crit-", got ${JSON.stringify(criterionId)}`,
        );
        continue;
      }
      if (criterionIds.has(criterionId)) {
        err(`capability ${c.id}: duplicate criterion id ${criterionId}`);
        continue;
      }
      criterionIds.add(criterionId);
    }
  }

  // -------------------------------------------------------- version chains
  const assessmentsByCapability = new Map<string, Assessment[]>();
  for (const a of assessments) {
    checkBaseProvenance("assessment", a.id, a.provenance, a.created_at, err);
    checkEnum("assessment", a.id, "status", a.status, ASSESSMENT_STATUSES, err);
    checkEnum("assessment", a.id, "confidence", a.confidence, CONFIDENCES, err);
    checkDate("assessment", a.id, "reviewed_at", a.reviewed_at, false, err);
    checkRefs("assessment", a.id, "capability_id", [a.capability_id], capabilityIds, err);
    checkRefs(
      "assessment",
      a.id,
      "supporting_evidence_ids",
      a.supporting_evidence_ids,
      evidenceIds,
      err,
    );
    checkRefs(
      "assessment",
      a.id,
      "counterevidence_ids",
      a.counterevidence_ids,
      evidenceIds,
      err,
    );
    if (a.supersedes_assessment_id !== null) {
      checkRefs(
        "assessment",
        a.id,
        "supersedes_assessment_id",
        [a.supersedes_assessment_id],
        assessmentIds,
        err,
      );
    }
    if (!Number.isInteger(a.version) || a.version < 1) {
      err(`assessment ${a.id}: version must be a positive integer, got ${JSON.stringify(a.version)}`);
    }
    const list = assessmentsByCapability.get(a.capability_id) ?? [];
    list.push(a);
    assessmentsByCapability.set(a.capability_id, list);
  }

  const assessmentById = new Map(assessments.map((a) => [a.id, a]));
  for (const [capabilityId, list] of assessmentsByCapability) {
    const sorted = [...list].sort((x, y) => x.version - y.version);
    const versions = new Set<number>();
    for (const a of sorted) {
      if (versions.has(a.version)) {
        err(`capability ${capabilityId}: duplicate assessment version ${a.version}`);
      }
      versions.add(a.version);

      if (a.version === 1) {
        if (a.supersedes_assessment_id !== null) {
          err(
            `assessment ${a.id}: version 1 must not supersede another assessment (got ${a.supersedes_assessment_id})`,
          );
        }
        continue;
      }

      const previousId = a.supersedes_assessment_id;
      if (previousId === null) {
        err(`assessment ${a.id}: version ${a.version} must supersede version ${a.version - 1}`);
        continue;
      }
      const previous = assessmentById.get(previousId);
      if (!previous) continue; // already reported as an unresolved reference
      if (previous.capability_id !== a.capability_id) {
        err(
          `assessment ${a.id}: supersedes ${previousId}, which belongs to capability ${previous.capability_id}`,
        );
      }
      if (previous.version !== a.version - 1) {
        err(
          `assessment ${a.id}: version ${a.version} must supersede version ${a.version - 1}, but ${previousId} is version ${previous.version}`,
        );
      }
    }

    const heads = sorted.filter(
      (a) => !sorted.some((other) => other.supersedes_assessment_id === a.id),
    );
    if (heads.length !== 1) {
      err(
        `capability ${capabilityId}: expected exactly one current assessment, found ${heads.length} (${heads
          .map((a) => a.id)
          .join(", ") || "none"})`,
      );
    }
  }

  // -------------------------------------------------------------- proposals
  for (const p of proposals) {
    checkBaseProvenance("proposal", p.id, p.provenance, p.created_at, err);
    checkEnum("proposal", p.id, "from_status", p.from_status, ASSESSMENT_STATUSES, err);
    checkEnum("proposal", p.id, "to_status", p.to_status, ASSESSMENT_STATUSES, err);
    checkRefs("proposal", p.id, "capability_id", [p.capability_id], capabilityIds, err);
    checkRefs(
      "proposal",
      p.id,
      "supporting_evidence_ids",
      p.supporting_evidence_ids,
      evidenceIds,
      err,
    );
    checkRefs("proposal", p.id, "counterevidence_ids", p.counterevidence_ids, evidenceIds, err);
    if (!p.recorded || typeof p.recorded !== "object" || Array.isArray(p.recorded)) {
      err(`proposal ${p.id}: recorded must be an object`);
      continue;
    }
    for (const [item, value] of Object.entries(p.recorded)) {
      if (!GATE_ITEM_IDS.has(item)) {
        err(`proposal ${p.id}: recorded key ${JSON.stringify(item)} is not a GateItemId`);
      }
      if (typeof value !== "string" || !value.trim()) {
        err(`proposal ${p.id}: recorded["${item}"] must be a non-empty string`);
      }
    }
  }

  // ----------------------------------------------------------------- events
  for (const e of events) {
    checkBaseProvenance("event", e.id, e.provenance, e.created_at, err);
    checkDate("event", e.id, "occurred_at", e.occurred_at, false, err);
    checkRefs("event", e.id, "capability_ids", e.capability_ids, capabilityIds, err);
    checkRefs("event", e.id, "evidence_ids", e.evidence_ids, evidenceIds, err);
  }

  // ----------------------------------------------------------- attributions
  for (const a of attributions) {
    checkBaseProvenance("attribution", a.id, a.provenance, a.created_at, err);
    checkEnum("attribution", a.id, "confidence", a.confidence, CONFIDENCES, err);
    checkEnum("attribution", a.id, "status", a.status, ATTRIBUTION_STATUSES, err);
    checkRefs("attribution", a.id, "event_id", [a.event_id], eventIds, err);
    checkRefs(
      "attribution",
      a.id,
      "supporting_evidence_ids",
      a.supporting_evidence_ids,
      evidenceIds,
      err,
    );
    checkRefs("attribution", a.id, "counterevidence_ids", a.counterevidence_ids, evidenceIds, err);
  }

  // -------------------------------------------------------------- forecasts
  for (const f of forecasts) {
    checkBaseProvenance("forecast", f.id, f.provenance, f.created_at, err);
    checkEnum("forecast", f.id, "status", f.status, FORECAST_STATUSES, err);
    checkDate("forecast", f.id, "resolution_date", f.resolution_date, false, err);
    checkDate("forecast", f.id, "resolved_at", f.resolved_at, true, err);
    checkRefs("forecast", f.id, "evidence_ids", f.evidence_ids, evidenceIds, err);
    if (f.probability !== null && (typeof f.probability !== "number" || f.probability < 0 || f.probability > 1)) {
      err(
        `forecast ${f.id}: probability must be null or a number between 0 and 1, got ${JSON.stringify(f.probability)}`,
      );
    }
    if (RESOLVED_FORECAST_STATUSES.has(f.status)) {
      if (f.resolved_at === null) {
        err(`forecast ${f.id}: status ${f.status} requires resolved_at`);
      }
      if (typeof f.resolution_notes !== "string" || !f.resolution_notes.trim()) {
        err(`forecast ${f.id}: status ${f.status} requires resolution_notes`);
      }
    }
    if (f.status === "open") {
      if (f.resolved_at !== null) {
        err(`forecast ${f.id}: an open forecast must not have resolved_at`);
      }
      if (f.resolution_notes !== null) {
        err(`forecast ${f.id}: an open forecast must not have resolution_notes`);
      }
    }
  }

  // -------------------------------------------------------------- questions
  for (const q of questions) {
    checkEnum("question", q.id, "provenance", q.provenance, PROVENANCES, err);
    checkRefs("question", q.id, "capability_ids", q.capability_ids, capabilityIds, err);
    if (typeof q.question !== "string" || !q.question.trim()) {
      err(`question ${q.id}: question must be a non-empty string`);
    }
  }

  return errors;
}

export function assertValidDataset(ds: Dataset): void {
  const violations = validateDataset(ds);
  if (violations.length > 0) {
    throw new Error(
      `Dataset validation failed with ${violations.length} violation(s):\n - ${violations.join("\n - ")}`,
    );
  }
}
