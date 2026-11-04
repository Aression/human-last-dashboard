import rawSnapshot from "../data/automation/snapshot.json";
import { DISCOVERED_LEAD_NOTE as leadNote } from "./automation-copy";

/**
 * Read-only view of what the local discovery and audit tooling
 * (`tools/evidence-mcp/`) last produced.
 *
 * The dashboard is a static site, so it cannot read the tool's store
 * (`.evidence-mcp/`, gitignored, never deployed). Instead the tooling writes a
 * snapshot to `data/automation/snapshot.json`, which is committed and rendered
 * here. That makes the page a record of one published run, not live data — the
 * page says so, and `generated_at` is shown.
 *
 * Nothing in this module can promote a lead. A candidate keeps
 * `provenance: "discovered"` and `source_tier: "lead"` forever; turning one into
 * a source or a claim is a separate, reviewed edit to `data/demo/dataset.ts`
 * (see docs/automation.md).
 */

export type CandidateStatus = "new" | "duplicate" | "triaged-review" | "rejected" | "archived";

export const CANDIDATE_STATUS_ORDER: CandidateStatus[] = [
  "new",
  "triaged-review",
  "duplicate",
  "rejected",
  "archived",
];

export const candidateStatusLabel: Record<CandidateStatus, string> = {
  new: "New",
  "triaged-review": "Accepted for review",
  duplicate: "Duplicate",
  rejected: "Rejected",
  archived: "Archived",
};

/** One discovered lead, reduced to the fields the dashboard renders. */
export interface AutomationLead {
  id: string;
  title: string;
  url: string;
  publisher: string;
  published_at: string | null;
  source_type: string;
  adapter: string;
  query_id: string;
  created_at: string;
  status: CandidateStatus;
  http_status: number | null;
  /** Present when the fetch produced bytes that were hashed. */
  content_hash: string | null;
  note: string | null;
}

export interface AutomationAuditCheck {
  rule: string;
  ok: boolean;
  findings: number;
  inspected: number;
  duration_ms: number;
  error?: string;
}

export interface AutomationAudit {
  run_id: string;
  started_at: string;
  finished_at: string;
  counts: { error: number; warn: number; info: number; total: number };
  inspected_total: number;
  checks: AutomationAuditCheck[];
}

export interface AutomationRun {
  run_id: string;
  task: string;
  started_at: string;
  ok: boolean;
  summary: string;
}

export interface AutomationSnapshot {
  schema_version: 1;
  generated_at: string;
  generated_by: string;
  disclaimer: string;
  store: {
    runs: number;
    discovery_runs: number;
    quality_runs: number;
    first_run_at: string | null;
    last_run_at: string | null;
  };
  candidates: {
    total: number;
    stored_records: number;
    by_status: Partial<Record<CandidateStatus, number>>;
    by_adapter: Array<{ adapter: string; count: number }>;
    by_query: Array<{ query_id: string; count: number }>;
    by_day: Array<{ date: string; count: number }>;
    retrieval: {
      with_content_hash: number;
      fetch_errors: number;
      /** Why a lead has no usable page. Sums to at most `fetch_errors`. */
      by_reason: Array<{ reason: string; count: number }>;
    };
    items: AutomationLead[];
  };
  audit: AutomationAudit | null;
  runs: AutomationRun[];
}

export const DISCOVERED_LEAD_NOTE = leadNote;

const ISO = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/;
const LEAD_STATUSES: readonly string[] = CANDIDATE_STATUS_ORDER;

/**
 * Structural checks for the committed snapshot. Like `validateDataset`, this is
 * runtime validation: the JSON file is data, not typed code, so a bad snapshot
 * must fail the build rather than render a half-empty page.
 */
export function validateAutomationSnapshot(value: unknown): string[] {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`automation snapshot: ${message}`);

  if (typeof value !== "object" || value === null) {
    return ["automation snapshot: not an object"];
  }
  const snap = value as Partial<AutomationSnapshot>;

  if (snap.schema_version !== 1) fail(`schema_version must be 1, got ${String(snap.schema_version)}`);
  if (typeof snap.generated_at !== "string" || !ISO.test(snap.generated_at)) {
    fail("generated_at must be an ISO timestamp");
  }
  if (typeof snap.generated_by !== "string" || snap.generated_by.trim().length < 3) {
    fail("generated_by must name the producer");
  }
  if (typeof snap.disclaimer !== "string" || snap.disclaimer.trim().length < 40) {
    fail("disclaimer must be a sentence a reader can act on");
  }

  const store = snap.store;
  if (!store || typeof store !== "object") {
    fail("store block is missing");
  } else {
    for (const key of ["runs", "discovery_runs", "quality_runs"] as const) {
      if (typeof store[key] !== "number" || store[key] < 0 || !Number.isInteger(store[key])) {
        fail(`store.${key} must be a non-negative integer`);
      }
    }
    for (const key of ["first_run_at", "last_run_at"] as const) {
      const v = store[key];
      if (v !== null && (typeof v !== "string" || !ISO.test(v))) fail(`store.${key} must be ISO or null`);
    }
  }

  const candidates = snap.candidates;
  if (!candidates || typeof candidates !== "object") {
    fail("candidates block is missing");
  } else {
    if (typeof candidates.total !== "number" || candidates.total < 0) {
      fail("candidates.total must be a non-negative number");
    }
    if (!Array.isArray(candidates.items)) {
      fail("candidates.items must be an array");
    } else {
      if (candidates.items.length > candidates.total) {
        fail("candidates.items holds more leads than candidates.total");
      }
      const seen = new Set<string>();
      for (const [index, item] of candidates.items.entries()) {
        const where = `candidates.items[${index}]`;
        if (typeof item?.id !== "string" || item.id.length === 0) fail(`${where}.id is missing`);
        if (seen.has(item?.id)) fail(`${where}.id is duplicated (${item?.id})`);
        seen.add(item?.id);
        if (typeof item?.title !== "string" || item.title.trim().length === 0) fail(`${where}.title is empty`);
        if (typeof item?.url !== "string" || !/^https?:\/\//.test(item.url)) {
          fail(`${where}.url must be http(s)`);
        }
        if (typeof item?.adapter !== "string" || item.adapter.length === 0) fail(`${where}.adapter is missing`);
        if (typeof item?.query_id !== "string" || item.query_id.length === 0) fail(`${where}.query_id is missing`);
        if (typeof item?.status !== "string" || !LEAD_STATUSES.includes(item.status)) {
          fail(`${where}.status must be one of ${LEAD_STATUSES.join(" | ")}`);
        }
        if (typeof item?.created_at !== "string" || !ISO.test(item.created_at)) {
          fail(`${where}.created_at must be an ISO timestamp`);
        }
        if (item?.published_at !== null && (typeof item?.published_at !== "string" || !ISO.test(item.published_at))) {
          fail(`${where}.published_at must be ISO or null`);
        }
        if (item?.http_status !== null && (typeof item?.http_status !== "number" || item.http_status < 100)) {
          fail(`${where}.http_status must be an HTTP status or null`);
        }
        if (item?.content_hash !== null && (typeof item?.content_hash !== "string" || item.content_hash.length === 0)) {
          fail(`${where}.content_hash must be a hash or null`);
        }
      }
    }

    const statusSum = Object.values(candidates.by_status ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);
    if (statusSum !== candidates.total) {
      fail(`candidates.by_status sums to ${statusSum}, expected ${candidates.total}`);
    }
    for (const [name, groups] of [
      ["by_adapter", candidates.by_adapter],
      ["by_query", candidates.by_query],
      ["by_day", candidates.by_day],
    ] as const) {
      if (!Array.isArray(groups) || groups.length === 0) {
        fail(`candidates.${name} must be a non-empty array`);
        continue;
      }
      const sum = groups.reduce((acc, g) => acc + g.count, 0);
      if (sum !== candidates.total) fail(`candidates.${name} sums to ${sum}, expected ${candidates.total}`);
    }
    for (const [index, day] of (candidates.by_day ?? []).entries()) {
      if (typeof day?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
        fail(`candidates.by_day[${index}].date must be a calendar date`);
      }
    }
    for (const key of ["with_content_hash", "fetch_errors"] as const) {
      const v = candidates.retrieval?.[key];
      if (typeof v !== "number" || v < 0) fail(`candidates.retrieval.${key} must be a non-negative number`);
    }
    const reasons = candidates.retrieval?.by_reason;
    if (!Array.isArray(reasons)) {
      fail("candidates.retrieval.by_reason must be an array");
    } else {
      const reasonSum = reasons.reduce((acc, entry) => acc + (entry?.count ?? 0), 0);
      if (reasonSum > (candidates.retrieval?.fetch_errors ?? 0)) {
        fail("candidates.retrieval.by_reason counts more leads than fetch_errors");
      }
      for (const [index, entry] of reasons.entries()) {
        if (typeof entry?.reason !== "string" || entry.reason.trim().length === 0) {
          fail(`candidates.retrieval.by_reason[${index}].reason is empty`);
        }
        if (typeof entry?.count !== "number" || entry.count < 1) {
          fail(`candidates.retrieval.by_reason[${index}].count must be a positive number`);
        }
      }
    }
  }

  if (snap.audit !== null && snap.audit !== undefined) {
    const audit = snap.audit;
    if (typeof audit.run_id !== "string" || audit.run_id.length === 0) fail("audit.run_id is missing");
    if (typeof audit.started_at !== "string" || !ISO.test(audit.started_at)) fail("audit.started_at must be an ISO timestamp");
    if (typeof audit.finished_at !== "string" || !ISO.test(audit.finished_at)) {
      fail("audit.finished_at must be an ISO timestamp");
    }
    const counts = audit.counts;
    if (!counts || typeof counts !== "object") {
      fail("audit.counts is missing");
    } else if (counts.error + counts.warn + counts.info !== counts.total) {
      fail("audit.counts.total must equal error + warn + info");
    }
    if (!Array.isArray(audit.checks) || audit.checks.length === 0) {
      fail("audit.checks must be a non-empty array");
    } else {
      const rules = new Set<string>();
      for (const [index, check] of audit.checks.entries()) {
        const where = `audit.checks[${index}]`;
        if (typeof check?.rule !== "string" || check.rule.length === 0) fail(`${where}.rule is missing`);
        if (rules.has(check?.rule)) fail(`${where}.rule is duplicated (${check?.rule})`);
        rules.add(check?.rule);
        if (typeof check?.ok !== "boolean") fail(`${where}.ok must be a boolean`);
        if (typeof check?.findings !== "number" || check.findings < 0) fail(`${where}.findings must be non-negative`);
        if (typeof check?.inspected !== "number" || check.inspected < 0) fail(`${where}.inspected must be non-negative`);
      }
      const inspectedSum = audit.checks.reduce((acc, c) => acc + c.inspected, 0);
      if (audit.inspected_total !== inspectedSum) {
        fail(`audit.inspected_total is ${audit.inspected_total} but the checks sum to ${inspectedSum}`);
      }
    }
  }

  if (!Array.isArray(snap.runs)) {
    fail("runs must be an array");
  } else {
    for (const [index, run] of snap.runs.entries()) {
      const where = `runs[${index}]`;
      if (typeof run?.run_id !== "string" || run.run_id.length === 0) fail(`${where}.run_id is missing`);
      if (typeof run?.task !== "string" || run.task.length === 0) fail(`${where}.task is missing`);
      if (typeof run?.started_at !== "string" || !ISO.test(run.started_at)) fail(`${where}.started_at must be an ISO timestamp`);
      if (typeof run?.ok !== "boolean") fail(`${where}.ok must be a boolean`);
      if (typeof run?.summary !== "string") fail(`${where}.summary must be a string`);
    }
  }

  return errors;
}

/** Throws one aggregated message, so a broken snapshot names every problem at once. */
export function assertValidAutomationSnapshot(value: unknown): asserts value is AutomationSnapshot {
  const errors = validateAutomationSnapshot(value);
  if (errors.length > 0) {
    throw new Error(`Invalid automation snapshot:\n - ${errors.join("\n - ")}`);
  }
}

let cached: AutomationSnapshot | null = null;

export function loadAutomationSnapshot(): AutomationSnapshot {
  if (cached) return cached;
  assertValidAutomationSnapshot(rawSnapshot);
  cached = rawSnapshot as AutomationSnapshot;
  return cached;
}

/** Leads are shown newest-first; the snapshot stores them in that order already. */
export function leads(snapshot: AutomationSnapshot = loadAutomationSnapshot()): AutomationLead[] {
  return snapshot.candidates.items;
}

export function statusCount(snapshot: AutomationSnapshot, status: CandidateStatus): number {
  return snapshot.candidates.by_status[status] ?? 0;
}

/** Rules that had nothing to look at. A skipped check is not a pass. */
export function skippedChecks(audit: AutomationAudit | null): AutomationAuditCheck[] {
  if (!audit) return [];
  return audit.checks.filter((check) => check.inspected === 0);
}

type PageLocale = "en" | "zh";

/**
 * Failure reasons are produced by the tooling in English and stored in the
 * snapshot. Only the three fixed phrases are translated; an HTTP status line
 * stays as it came back from the server.
 */
const REASON_ZH: Record<string, string> = {
  "rate limited": "触发限流",
  "fetch timed out": "请求超时",
  "other fetch error": "其他抓取错误",
};

export function localizeReason(reason: string, locale: PageLocale): string {
  if (locale === "en") return reason;
  const match = /^(.*?)(?:\s*\(HTTP (\d+)\))?$/.exec(reason);
  const phrase = match?.[1] ?? reason;
  const status = match?.[2];
  const translated = REASON_ZH[phrase];
  if (!translated) return reason;
  return status ? `${translated}（HTTP ${status}）` : translated;
}

/**
 * A lead's note records what the fetcher hit, in the tooling's English. The
 * label is translated and the machine detail is kept verbatim so it stays
 * checkable — an error string that was paraphrased would no longer be evidence.
 */
export function localizeNote(note: string, locale: PageLocale): string {
  if (locale === "en") return note;
  const prefix: Record<string, string> = {
    "retrieval failed:": "抓取失败：",
    "response body could not be read:": "无法读取响应正文：",
  };
  for (const [en, zh] of Object.entries(prefix)) {
    if (note.startsWith(en)) return `${zh} ${note.slice(en.length).trim()}`;
  }
  if (/^HTTP \d+ Too Many Requests$/.test(note)) return note.replace("Too Many Requests", "请求过多");
  return note;
}
