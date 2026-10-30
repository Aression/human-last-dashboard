/**
 * Quality maintenance rules.
 *
 * This module *audits* records and *proposes* maintenance. It never edits the
 * dataset, never writes into `lib/`, `app/`, or `components/`, and never promotes a
 * discovered lead into evidence (AGENTS.md rules 2-4 and 10). Every rule reports a
 * finding plus a remediation sentence; applying a remediation is a separate,
 * reviewed edit performed by a human or by an explicit tool call.
 *
 * Provenance note: a quality finding describes bookkeeping. It is not a judgement
 * about the truth of a claim, and a green check is not a verification.
 */
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import type { Dataset } from "../../../lib/types";
import { dataset as demoDataset } from "../../../data/demo/dataset";
import {
  activeBottlenecks,
  assessmentHistory,
  currentAssessment,
  ds as selectorDataset,
  evidenceStats,
  pendingReviews,
  recentActivity,
  sourceOf,
} from "../../../lib/data";
import { validateDataset } from "../../../lib/validate";

import type {
  CandidateRecord,
  QualityFinding,
  QualityOptions,
  QualityOutcome,
  Severity,
  ToolConfig,
} from "./contracts";
import { defaultConfigPath, isFetchableUrl, loadConfig } from "./config";
import { summarize } from "./report";
import type { StorePaths } from "./store";
import {
  appendJsonl,
  ensureStore,
  findRepoRoot,
  htmlToText,
  newRunId,
  readJson,
  sha256,
  shortHash,
  storePaths,
  withLock,
  writeJson,
} from "./store";

/** Open forecasts the overdue rule reports before it stops. */
const FORECAST_OVERDUE_CAP = 2;
/** A candidate untouched this long is called untriaged (fixed threshold, not config). */
const UNTRIAGED_AFTER_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/**
 * Everything a rule is allowed to look at. Rules are pure with respect to the
 * filesystem: they receive the dataset and the store readers, and return findings.
 */
export interface QualityContext {
  config: ToolConfig;
  repoRoot: string;
  store: StorePaths;
  /** The dataset under audit. Defaults to the demo dataset in data/demo/dataset.ts. */
  dataset: Dataset;
  readCandidate: (id: string) => Promise<CandidateRecord | null>;
  listCandidates: () => Promise<CandidateRecord[]>;
  /** Injected in tests; the real network is never required to run a rule. */
  fetchImpl: typeof fetch;
  now: () => Date;
  /** Cap on how many subjects one rule inspects. Infinity unless the caller caps it. */
  limit: number;
  /**
   * Records how many subjects the rule actually evaluated. Every rule calls this,
   * including when it finds nothing: `inspected === 0` is what lets the report say
   * "skipped" instead of implying the records were checked and are fine.
   */
  countInspected: (subjects: number) => void;
}

export interface QualityRule {
  id: string;
  label: string;
  /** Default severity for this rule's findings; a rule may report a different one. */
  severity: Severity;
  /** True only for maintenance that cannot alter a claim (archive, refresh metadata). */
  autoFixable: boolean;
  run: (ctx: QualityContext) => Promise<QualityFinding[]>;
}

/**
 * `QualityOptions` is the frozen contract. These two optional fields are a
 * dev/test escape hatch: they let the test suite audit a synthetic dataset and a
 * deterministic config without touching data/demo/dataset.ts or the committed config.
 * Production callers (MCP server, daemon, CLI) pass a plain `QualityOptions`.
 */
export type QualityRunOptions = QualityOptions & {
  dataset?: Dataset;
  config?: ToolConfig;
};

interface FindingInput {
  subject: QualityFinding["subject"];
  title: string;
  detail: string;
  evidence: QualityFinding["evidence"];
  remediation: string;
  severity?: Severity;
  autoFixable?: boolean;
}

/** Ids are derived from rule + subject + detail, so a repeat run yields the same ids. */
function makeFinding(rule: QualityRule, input: FindingInput): QualityFinding {
  const subjectKey = `${input.subject.kind}:${input.subject.id ?? ""}`;
  return {
    id: `qf-${rule.id}-${shortHash(`${rule.id}|${subjectKey}|${input.detail}`)}`,
    rule: rule.id,
    severity: input.severity ?? rule.severity,
    title: input.title,
    detail: input.detail,
    subject: input.subject,
    evidence: input.evidence,
    remediation: input.remediation,
    auto_fixable: input.autoFixable ?? rule.autoFixable,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whole days between an ISO date and now; unparseable dates are dataset-valid's job. */
function ageDays(iso: string, now: Date): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.floor((now.getTime() - t) / MS_PER_DAY);
}

function capOf(ctx: QualityContext, ruleCap: number = Number.POSITIVE_INFINITY): number {
  return Math.min(ctx.limit, ruleCap);
}

/** Records a whole-dataset rule inspected: every array in the dataset counts. */
function recordCount(dataset: Dataset): number {
  return (
    dataset.sources.length +
    dataset.claims.length +
    dataset.evidence.length +
    dataset.capabilities.length +
    dataset.assessments.length +
    dataset.proposals.length +
    dataset.events.length +
    dataset.attributions.length +
    dataset.forecasts.length +
    dataset.questions.length
  );
}

// --------------------------------------------------------------------- rules

const datasetValid: QualityRule = {
  id: "dataset-valid",
  label: "Dataset passes lib/validate.ts",
  severity: "error",
  autoFixable: false,
  async run(ctx) {
    const violations = validateDataset(ctx.dataset);
    ctx.countInspected(recordCount(ctx.dataset));
    return violations.map((violation) =>
      makeFinding(datasetValid, {
        subject: { kind: "dataset", id: "dataset" },
        title: "Dataset validation violation",
        detail: violation,
        evidence: [{ kind: "value", value: violation }],
        remediation:
          "Correct the offending record (lib/validate.ts names the field) in data/demo/dataset.ts or in the ingested JSON. The quality run reports the violation and never edits data.",
      }),
    );
  },
};

/**
 * Probes the selector layer the dashboard renders through. `lib/data/index.ts`
 * binds the demo dataset at module load, so an injected dataset (dev-time only) is
 * replayed through probes that apply the same resolution contract locally.
 */
function moduleSelectorProbes(): Array<{ name: string; run: () => void }> {
  return [
    {
      name: "sourceOf(claims)",
      run: () => {
        for (const claim of selectorDataset.claims) sourceOf(claim);
      },
    },
    {
      name: "sourceOf(evidence)",
      run: () => {
        for (const evidence of selectorDataset.evidence) sourceOf(evidence);
      },
    },
    {
      name: "assessmentHistory/currentAssessment",
      run: () => {
        for (const capability of selectorDataset.capabilities) {
          assessmentHistory(capability.id);
          currentAssessment(capability.id);
        }
      },
    },
    { name: "evidenceStats", run: () => void evidenceStats() },
    { name: "recentActivity", run: () => void recentActivity() },
    { name: "pendingReviews", run: () => void pendingReviews() },
    { name: "activeBottlenecks", run: () => void activeBottlenecks() },
  ];
}

function datasetRefProbes(dataset: Dataset): Array<{ name: string; run: () => void }> {
  const sourceIds = new Set(dataset.sources.map((s) => s.id));
  const claimIds = new Set(dataset.claims.map((c) => c.id));
  const capabilityIds = new Set(dataset.capabilities.map((c) => c.id));
  return [
    {
      name: "sourceOf(claims)",
      run: () => {
        for (const claim of dataset.claims) {
          if (!sourceIds.has(claim.source_id)) {
            throw new Error(`Dangling source reference: ${claim.source_id}`);
          }
        }
      },
    },
    {
      name: "sourceOf(evidence)",
      run: () => {
        for (const evidence of dataset.evidence) {
          if (!sourceIds.has(evidence.source_id)) {
            throw new Error(`Dangling source reference: ${evidence.source_id}`);
          }
        }
      },
    },
    {
      name: "claimsForEvidence",
      run: () => {
        for (const evidence of dataset.evidence) {
          for (const id of evidence.claim_ids) {
            if (!claimIds.has(id)) throw new Error(`Dangling claim reference: ${id}`);
          }
        }
      },
    },
    {
      name: "evidenceForCapability",
      run: () => {
        for (const evidence of dataset.evidence) {
          for (const id of evidence.capability_ids) {
            if (!capabilityIds.has(id)) throw new Error(`Dangling capability reference: ${id}`);
          }
        }
      },
    },
    {
      name: "assessmentHistory/currentAssessment",
      run: () => {
        for (const assessment of dataset.assessments) {
          if (!capabilityIds.has(assessment.capability_id)) {
            throw new Error(`Dangling capability reference: ${assessment.capability_id}`);
          }
        }
      },
    },
  ];
}

const datasetSelectors: QualityRule = {
  id: "dataset-selectors",
  label: "Dashboard selectors build without dangling references",
  severity: "error",
  autoFixable: false,
  async run(ctx) {
    const probes =
      ctx.dataset === selectorDataset ? moduleSelectorProbes() : datasetRefProbes(ctx.dataset);
    // One probe is one selector contract exercised against the dataset.
    ctx.countInspected(probes.length);
    const findings: QualityFinding[] = [];
    for (const probe of probes) {
      try {
        probe.run();
      } catch (error) {
        findings.push(
          makeFinding(datasetSelectors, {
            subject: { kind: "dataset", id: "dataset" },
            title: "A dashboard selector throws on this dataset",
            detail: `selector probe ${probe.name}: ${describeError(error)}`,
            evidence: [
              { kind: "path", value: "lib/selectors.ts" },
              { kind: "value", value: describeError(error) },
            ],
            remediation:
              "Point the record's foreign key at an existing id, or add the missing record. lib/selectors.ts throws instead of rendering a broken link, so a dangling reference is a page-level failure.",
          }),
        );
      }
    }
    return findings;
  },
};

const candidateStale: QualityRule = {
  id: "candidate-stale",
  label: "Candidates untouched past the configured age",
  severity: "warn",
  autoFixable: true,
  async run(ctx) {
    const maxAgeDays = ctx.config.quality.candidate_max_age_days;
    const now = ctx.now();
    const candidates = (await ctx.listCandidates()).slice(0, capOf(ctx));
    ctx.countInspected(candidates.length);
    const findings: QualityFinding[] = [];
    for (const candidate of candidates) {
      if (candidate.status !== "new") continue;
      const age = ageDays(candidate.created_at, now);
      if (age <= maxAgeDays) continue;
      findings.push(
        makeFinding(candidateStale, {
          subject: { kind: "candidate", id: candidate.id },
          title: "Candidate is stale",
          detail: `status "new" for ${age} days, past the configured ${maxAgeDays}-day limit`,
          evidence: [
            { kind: "value", value: `status=${candidate.status}` },
            { kind: "value", value: `created_at=${candidate.created_at}` },
            { kind: "url", value: candidate.source.canonical_url },
          ],
          remediation: "archive after review",
        }),
      );
    }
    return findings;
  },
};

const candidateUntriaged: QualityRule = {
  id: "candidate-untriaged",
  label: "Candidates waiting more than 14 days for triage",
  severity: "info",
  autoFixable: false,
  async run(ctx) {
    const now = ctx.now();
    const candidates = (await ctx.listCandidates()).slice(0, capOf(ctx));
    ctx.countInspected(candidates.length);
    const findings: QualityFinding[] = [];
    for (const candidate of candidates) {
      if (candidate.status !== "new" || candidate.triage !== null) continue;
      const age = ageDays(candidate.created_at, now);
      if (age <= UNTRIAGED_AFTER_DAYS) continue;
      findings.push(
        makeFinding(candidateUntriaged, {
          subject: { kind: "candidate", id: candidate.id },
          title: "Candidate has no triage decision",
          detail: `discovered ${age} days ago (${candidate.created_at}) and still status "new" with no triage record`,
          evidence: [
            { kind: "value", value: `status=${candidate.status}` },
            { kind: "value", value: `created_at=${candidate.created_at}` },
            { kind: "url", value: candidate.source.canonical_url },
          ],
          remediation:
            "A human records one of accept-for-review / reject / duplicate in the candidate's triage block. Nothing is auto-promoted: a candidate stays tier \"lead\" until it is reviewed.",
        }),
      );
    }
    return findings;
  },
};

const candidateSuspectUrl: QualityRule = {
  id: "candidate-suspect-url",
  label: "Candidate URLs the tool must never fetch",
  severity: "error",
  autoFixable: false,
  async run(ctx) {
    const denyHosts = ctx.config.quality.deny_hosts;
    const candidates = (await ctx.listCandidates()).slice(0, capOf(ctx));
    ctx.countInspected(candidates.length);
    const findings: QualityFinding[] = [];
    for (const candidate of candidates) {
      const url = candidate.source?.canonical_url;
      if (typeof url !== "string" || isFetchableUrl(url, denyHosts)) continue;
      let reason = "not an absolute http(s) URL";
      try {
        const parsed = new URL(url);
        reason = `host ${parsed.hostname} is denied or private (protocol ${parsed.protocol})`;
      } catch {
        reason = `unparseable URL ${JSON.stringify(url)}`;
      }
      findings.push(
        makeFinding(candidateSuspectUrl, {
          subject: { kind: "candidate", id: candidate.id },
          title: "Candidate URL is not fetchable by this tool",
          detail: `canonical_url ${JSON.stringify(url)} fails isFetchableUrl: ${reason}`,
          evidence: [
            { kind: "url", value: String(url) },
            { kind: "value", value: reason },
          ],
          remediation:
            "Reject the candidate, or replace the URL with a public http(s) source a reviewer can open. Loopback, private, and link-local hosts are never fetched.",
        }),
      );
    }
    return findings;
  },
};

const candidateDuplicateHash: QualityRule = {
  id: "candidate-duplicate-hash",
  label: "Candidates sharing content with no duplicate marked",
  severity: "warn",
  autoFixable: true,
  async run(ctx) {
    const candidates = (await ctx.listCandidates()).slice(0, capOf(ctx));
    ctx.countInspected(candidates.length);
    const groups = new Map<string, CandidateRecord[]>();
    for (const candidate of candidates) {
      const hash = candidate.retrieval?.content_hash;
      if (typeof hash !== "string" || hash.length === 0) continue;
      const group = groups.get(hash) ?? [];
      group.push(candidate);
      groups.set(hash, group);
    }
    const findings: QualityFinding[] = [];
    for (const hash of [...groups.keys()].sort()) {
      const group = (groups.get(hash) ?? []).sort((a, b) => a.id.localeCompare(b.id));
      if (group.length < 2) continue;
      const marked = group.some(
        (c) => c.status === "duplicate" || (c.duplicate_of !== null && c.duplicate_of !== undefined),
      );
      if (marked) continue;
      findings.push(
        makeFinding(candidateDuplicateHash, {
          subject: { kind: "candidate", id: group[0].id },
          title: "Duplicate content with no duplicate marker",
          detail: `${group.length} candidates share content_hash ${hash.slice(0, 16)}… and none is marked duplicate: ${group
            .map((c) => c.id)
            .join(", ")}`,
          evidence: [
            { kind: "value", value: `content_hash=${hash}` },
            ...group.map((c) => ({ kind: "url" as const, value: c.source.canonical_url })),
          ],
          remediation:
            "Mark all but the earliest candidate status \"duplicate\" with duplicate_of pointing at the record kept for review, then archive the rest after review.",
        }),
      );
    }
    return findings;
  },
};

const evidenceUnreviewed: QualityRule = {
  id: "evidence-unreviewed",
  label: "Demo evidence left unreviewed past the configured age",
  severity: "warn",
  autoFixable: false,
  async run(ctx) {
    const maxAgeDays = ctx.config.quality.unreviewed_evidence_days;
    const now = ctx.now();
    const batch = ctx.dataset.evidence.slice(0, capOf(ctx));
    ctx.countInspected(batch.length);
    const findings: QualityFinding[] = [];
    for (const evidence of batch) {
      if (evidence.provenance !== "demo") continue;
      if (evidence.review_status !== "unreviewed") continue;
      const age = ageDays(evidence.created_at, now);
      if (age <= maxAgeDays) continue;
      findings.push(
        makeFinding(evidenceUnreviewed, {
          subject: { kind: "evidence", id: evidence.id },
          title: "Unreviewed evidence is older than the review window",
          detail: `demo evidence unreviewed for ${age} days (created_at ${evidence.created_at}), past the configured ${maxAgeDays}-day window. This record is fictional demo data; the finding exists to exercise the rule.`,
          evidence: [
            { kind: "value", value: `review_status=${evidence.review_status}` },
            { kind: "value", value: `created_at=${evidence.created_at}` },
            { kind: "value", value: `provenance=${evidence.provenance} (demo data, not a real observation)` },
          ],
          remediation:
            "A human reviews the record and sets review_status (accepted / rejected / needs-follow-up). Review status is never set by this tool.",
        }),
      );
    }
    return findings;
  },
};

const forecastOverdue: QualityRule = {
  id: "forecast-overdue",
  label: "Open forecasts past their resolution date",
  severity: "warn",
  autoFixable: false,
  async run(ctx) {
    const now = ctx.now();
    // Only forecasts still open are subjects of this rule; resolved ones are done.
    const openForecasts = ctx.dataset.forecasts.filter((f) => f.status === "open");
    ctx.countInspected(openForecasts.length);
    const open = openForecasts
      .filter((f) => {
        const t = Date.parse(f.resolution_date);
        return !Number.isNaN(t) && t < now.getTime();
      })
      .sort((a, b) => a.resolution_date.localeCompare(b.resolution_date) || a.id.localeCompare(b.id))
      .slice(0, capOf(ctx, FORECAST_OVERDUE_CAP));
    return open.map((forecast) =>
      makeFinding(forecastOverdue, {
        subject: { kind: "forecast", id: forecast.id },
        title: "Forecast resolution date has passed while still open",
        detail: `status "open" but resolution_date ${forecast.resolution_date} is in the past: ${forecast.statement}`,
        evidence: [
          { kind: "value", value: `status=${forecast.status}` },
          { kind: "value", value: `resolution_date=${forecast.resolution_date}` },
        ],
        remediation:
          "Record the outcome (resolved-true / resolved-false) with resolved_at and resolution_notes, or mark the forecast expired. Leaving it open long past its date makes the track record unreadable.",
      }),
    );
  },
};

interface SourceProbe {
  status: number;
  body?: Uint8Array;
}

/**
 * HEAD first (cheap), GET only when the recorded content hash has to be checked or
 * the server refuses HEAD. A network failure is rethrown so the runner records it
 * on the check: an unreachable source must never look like a passing check.
 */
async function probeSource(
  url: string,
  needBody: boolean,
  ctx: QualityContext,
): Promise<SourceProbe> {
  const timeoutMs = ctx.config.request_timeout_ms;
  const headers = { "user-agent": ctx.config.userAgent };
  const signal = AbortSignal.timeout(timeoutMs);

  if (!needBody) {
    const head = await ctx.fetchImpl(url, { method: "HEAD", headers, signal });
    if (head.status !== 405 && head.status !== 501) return { status: head.status };
  }
  const response = await ctx.fetchImpl(url, { method: "GET", headers, signal });
  const body = needBody && response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
  return { status: response.status, body };
}

const sourceIntegrity: QualityRule = {
  id: "source-integrity",
  label: "Recorded source URLs answer and match their content hash",
  severity: "warn",
  autoFixable: false,
  async run(ctx) {
    const denyHosts = ctx.config.quality.deny_hosts;
    const batch = ctx.dataset.sources
      .filter(
        (source) =>
          typeof source.canonical_url === "string" && isFetchableUrl(source.canonical_url, denyHosts),
      )
      .slice(0, capOf(ctx, ctx.config.quality.integrity_batch));

    const findings: QualityFinding[] = [];
    // Counted per fetch attempt below, so a failure still reports what it reached.
    let probed = 0;
    ctx.countInspected(probed);
    for (const source of batch) {
      const url = source.canonical_url as string;
      const needBody = source.content_hash !== null;
      let probe: SourceProbe;
      try {
        probe = await probeSource(url, needBody, ctx);
        probed += 1;
        ctx.countInspected(probed);
      } catch (error) {
        throw new Error(`source-integrity could not fetch ${url}: ${describeError(error)}`);
      }

      if (probe.status < 200 || probe.status >= 300) {
        findings.push(
          makeFinding(sourceIntegrity, {
            subject: { kind: "source", id: source.id },
            title: "Source URL did not answer with a 2xx status",
            detail: `recorded canonical_url returned HTTP ${probe.status}`,
            evidence: [
              { kind: "url", value: url },
              { kind: "value", value: `http_status=${probe.status}` },
            ],
            remediation:
              "Re-check the URL in a browser. If the page moved, record the new canonical_url and retrieved_at; if it is gone, set the source status to unavailable. Do not delete the record: it may still underpin existing evidence.",
            severity: "warn",
          }),
        );
        continue;
      }

      if (source.content_hash === null || probe.body === undefined) continue;
      const rawHash = sha256(probe.body);
      const textHash = sha256(htmlToText(Buffer.from(probe.body).toString("utf8")));
      if (rawHash === source.content_hash || textHash === source.content_hash) continue;
      findings.push(
        makeFinding(sourceIntegrity, {
          subject: { kind: "source", id: source.id },
          title: "Source content no longer matches the recorded hash",
          detail: `recorded content_hash does not match the fetched bytes (raw ${rawHash.slice(0, 16)}…, normalised ${textHash.slice(0, 16)}…)`,
          evidence: [
            { kind: "url", value: url },
            { kind: "value", value: `recorded=${source.content_hash}` },
            { kind: "value", value: `fetched_raw=${rawHash}` },
            { kind: "value", value: `fetched_normalised=${textHash}` },
          ],
          remediation:
            "The page changed since it was recorded. Re-read it and, if the underlying claim is affected, record a new evidence record with its own retrieved_at and content_hash rather than overwriting the old one; otherwise refresh the hash with a note about what changed.",
          severity: "error",
        }),
      );
    }
    return findings;
  },
};

const provenanceGaps: QualityRule = {
  id: "provenance-gaps",
  label: "Curated sources and evidence records missing provenance fields",
  severity: "warn",
  autoFixable: false,
  async run(ctx) {
    const findings: QualityFinding[] = [];
    const sourceBatch = ctx.dataset.sources.slice(0, capOf(ctx));
    const evidenceBatch = ctx.dataset.evidence.slice(0, capOf(ctx));
    ctx.countInspected(sourceBatch.length + evidenceBatch.length);
    for (const source of sourceBatch) {
      if (source.provenance !== "curated") continue;
      const missing: string[] = [];
      if (source.retrieved_at === null) missing.push("retrieved_at");
      if (source.content_hash === null) missing.push("content_hash");
      if (missing.length === 0) continue;
      findings.push(
        makeFinding(provenanceGaps, {
          subject: { kind: "source", id: source.id },
          title: "Curated source is missing retrieval provenance",
          detail: `curated source has no ${missing.join(" and ")}; a curated source claims an observed document, so both are required`,
          evidence: [
            { kind: "value", value: `missing=${missing.join(",")}` },
            ...(source.canonical_url ? [{ kind: "url" as const, value: source.canonical_url }] : []),
          ],
          remediation:
            "Fetch the document, record retrieved_at and the sha256 of the fetched bytes. If it cannot be fetched any more, downgrade the source to demo or mark it unavailable instead of guessing the fields.",
        }),
      );
    }

    const sourceIds = new Set(ctx.dataset.sources.map((s) => s.id));
    const claimIds = new Set(ctx.dataset.claims.map((c) => c.id));
    for (const evidence of evidenceBatch) {
      const problems: string[] = [];
      if (!sourceIds.has(evidence.source_id)) {
        problems.push(`source_id ${evidence.source_id} does not resolve`);
      }
      // Evidence may legitimately back a capability directly without a claim
      // (demo e-06 does), so only a record attached to nothing at all is a gap.
      if (evidence.claim_ids.length === 0 && evidence.capability_ids.length === 0) {
        problems.push("claim_ids and capability_ids are both empty, so the evidence attaches to nothing in the graph");
      }
      const unresolvedClaims = evidence.claim_ids.filter((id) => !claimIds.has(id));
      if (unresolvedClaims.length > 0) {
        problems.push(`claim_ids do not resolve: ${unresolvedClaims.join(", ")}`);
      }
      if (problems.length === 0) continue;
      findings.push(
        makeFinding(provenanceGaps, {
          subject: { kind: "evidence", id: evidence.id },
          title: "Evidence record has a broken provenance chain",
          detail: problems.join("; "),
          evidence: [
            { kind: "value", value: `source_id=${evidence.source_id}` },
            { kind: "value", value: `claim_ids=${JSON.stringify(evidence.claim_ids)}` },
          ],
          remediation:
            "Attach the evidence to the source and claim(s) it actually came from, or withdraw the record. Evidence that supports no claim cannot be counted towards any assessment.",
        }),
      );
    }
    return findings;
  },
};

const RULES: QualityRule[] = [
  datasetValid,
  datasetSelectors,
  candidateStale,
  candidateUntriaged,
  candidateSuspectUrl,
  candidateDuplicateHash,
  evidenceUnreviewed,
  forecastOverdue,
  sourceIntegrity,
  provenanceGaps,
];

/** Rule ids, in the order a run executes them. */
export const QUALITY_RULES: string[] = RULES.map((rule) => rule.id);

function sortFindings(findings: QualityFinding[]): QualityFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id),
  );
}

function countSeverities(findings: QualityFinding[]): QualityOutcome["counts"] {
  const counts: QualityOutcome["counts"] = { error: 0, warn: 0, info: 0, total: findings.length };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

async function candidateReader(store: StorePaths) {
  /**
   * Candidates live one directory per discovery day
   * (`candidates/<YYYY-MM-DD>/<id>.json`), so a flat directory read sees only
   * folder names and silently finds nothing. Walk both shapes: the dated
   * subdirectories the discovery run writes, and loose files from an older
   * flat layout.
   */
  const candidateFiles = async (): Promise<string[]> => {
    const files: string[] = [];
    let entries: Dirent[];
    try {
      entries = await readdir(store.candidates, { withFileTypes: true, encoding: "utf8" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
      throw error;
    }
    for (const entry of entries) {
      const name = String(entry.name);
      const full = path.join(store.candidates, name);
      if (entry.isDirectory()) {
        for (const nested of await readdir(full, { encoding: "utf8" }).catch(() => [] as string[])) {
          if (nested.endsWith(".json")) files.push(path.join(full, nested));
        }
      } else if (entry.isFile() && name.endsWith(".json")) {
        files.push(full);
      }
    }
    return files.sort();
  };
  const readCandidate = async (id: string): Promise<CandidateRecord | null> => {
    for (const file of await candidateFiles()) {
      if (path.basename(file) !== `${id}.json`) continue;
      const record = await readJson<CandidateRecord>(file);
      if (record) return record;
    }
    return null;
  };
  const listCandidates = async (): Promise<CandidateRecord[]> => {
    const records: CandidateRecord[] = [];
    for (const file of await candidateFiles()) {
      const record = await readJson<CandidateRecord>(file);
      if (record) records.push(record);
    }
    return records.sort((a, b) => a.id.localeCompare(b.id));
  };
  return { readCandidate, listCandidates };
}

/**
 * Run every selected rule, write the outcome, and append a run record.
 *
 * Writes are confined to `<root>/.evidence-mcp/`: the dataset and the dashboard
 * source are read-only inputs here.
 */
export async function runQuality(
  options: QualityRunOptions = {},
): Promise<QualityOutcome> {
  const startedAt = new Date();
  const runId = newRunId("quality", startedAt);
  const repoRoot = findRepoRoot();
  const store = storePaths(repoRoot);
  const config = options.config ?? (await loadConfig(defaultConfigPath()));
  const dataset = options.dataset ?? demoDataset;

  const selected = options.rules ? resolveRules(options.rules) : RULES;
  const { readCandidate, listCandidates } = await candidateReader(store);

  const ctx: QualityContext = {
    config,
    repoRoot,
    store,
    dataset,
    readCandidate,
    listCandidates,
    fetchImpl: options.fetchImpl ?? fetch,
    now: () => new Date(),
    limit: options.limit ?? Number.POSITIVE_INFINITY,
    // Replaced per rule below; rules only ever see the scoped counter.
    countInspected: () => undefined,
  };

  return withLock(path.join(store.state, "quality.lock"), async () => {
    await ensureStore(store);
    const findings: QualityFinding[] = [];
    const checks: QualityOutcome["checks"] = [];

    for (const rule of selected) {
      const checkStarted = Date.now();
      // A rule records how many subjects it evaluated; a rule that inspected
      // nothing must say so rather than read as a pass.
      let inspected = 0;
      const ruleCtx: QualityContext = {
        ...ctx,
        countInspected: (subjects: number) => {
          inspected = Number.isFinite(subjects) ? Math.max(0, Math.trunc(subjects)) : 0;
        },
      };
      try {
        const ruleFindings = await rule.run(ruleCtx);
        findings.push(...ruleFindings);
        checks.push({
          rule: rule.id,
          ok: true,
          findings: ruleFindings.length,
          inspected,
          duration_ms: Date.now() - checkStarted,
        });
      } catch (error) {
        // A rule that cannot run is a failed check, never a quiet pass.
        checks.push({
          rule: rule.id,
          ok: false,
          findings: 0,
          inspected,
          duration_ms: Date.now() - checkStarted,
          error: describeError(error),
        });
      }
    }

    const sorted = sortFindings(findings);
    const outcome: QualityOutcome = {
      run_id: runId,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      findings: sorted,
      counts: countSeverities(sorted),
      checks,
    };

    // dryRun computes the outcome and writes nothing: no run file, no index line.
    if (!options.dryRun) {
      await writeJson(path.join(store.quality, `${runId}.json`), outcome);
      await appendJsonl(path.join(store.runs, "index.jsonl"), {
        run_id: outcome.run_id,
        task: "quality" as const,
        started_at: outcome.started_at,
        finished_at: outcome.finished_at,
        ok: checks.every((check) => check.ok),
        summary: summarize(outcome),
        counts: {
          findings: outcome.counts.total,
          error: outcome.counts.error,
          warn: outcome.counts.warn,
          info: outcome.counts.info,
          failed_checks: checks.filter((check) => !check.ok).length,
        },
      });
    }

    return outcome;
  });
}

function resolveRules(ids: string[]): QualityRule[] {
  const unknown = ids.filter((id) => !RULES.some((rule) => rule.id === id));
  if (unknown.length > 0) {
    throw new Error(
      `unknown quality rule(s): ${unknown.join(", ")} (known: ${QUALITY_RULES.join(", ")})`,
    );
  }
  return RULES.filter((rule) => ids.includes(rule.id));
}
