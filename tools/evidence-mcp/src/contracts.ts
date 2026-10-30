/**
 * Shared contracts for the evidence automation tool.
 *
 * Nothing in this file performs I/O. Both halves of the tool (discovery and
 * quality maintenance) exchange these shapes, so the MCP server, the daemon, and
 * the tests all agree on one vocabulary.
 *
 * Provenance rule (AGENTS.md rules 2, 3, 10): a discovered item is a *lead* with
 * provenance "discovered" until a human reviews it. No code path here can turn a
 * discovered item into a curated source, an accepted evidence record, or an
 * assessment change.
 */

/** Adapters are the only things that talk to the outside world during discovery. */
export type AdapterId = "arxiv" | "github" | "rss";

/** What a discovery query is allowed to claim about itself. */
export interface DiscoverQuery {
  id: string;
  title: string;
  /** Why this query exists — shown next to every candidate it produces. */
  intent: string;
  adapters: AdapterId[];
  /** Free-text search terms; adapters translate them, they never become prose in a record. */
  keywords: string[];
  /** Capability ids this query is meant to serve (hints for the reviewer, not evidence). */
  capability_ids: string[];
  /** Maximum items this query may contribute per run. */
  limit: number;
  /** RSS/Atom feeds for the "rss" adapter. */
  feeds?: string[];
}

export interface DiscoveryItem {
  adapter: AdapterId;
  /** Stable id inside the adapter's namespace (arXiv id, repo full name, entry guid). */
  external_id: string;
  title: string;
  url: string;
  publisher: string;
  authors: string[];
  /** ISO date (YYYY-MM-DD) when the adapter reports one, else null. */
  published_at: string | null;
  /** Adapter-supplied abstract/summary text, unmodified. */
  summary: string;
  raw_meta: Record<string, unknown>;
}

export interface AdapterResult {
  adapter: AdapterId;
  ok: boolean;
  items: DiscoveryItem[];
  requests: number;
  duration_ms: number;
  /** Present when ok is false; a failure is reported, never silently swallowed. */
  error?: string;
}

export interface AdapterContext {
  query: DiscoverQuery;
  limit: number;
  fetchImpl: typeof fetch;
  now: () => Date;
  /** User-agent sent with every request; identifies this tool and its version. */
  userAgent: string;
}

export interface Adapter {
  id: AdapterId;
  label: string;
  run(ctx: AdapterContext): Promise<AdapterResult>;
}

/** Source type guesses are deliberately coarse: a reviewer refines them. */
export type CandidateSourceType =
  | "paper"
  | "report"
  | "benchmark"
  | "repository"
  | "announcement"
  | "unknown";

export type CandidateStatus =
  | "new"
  | "duplicate"
  | "triaged-review"
  | "rejected"
  | "archived";

/**
 * A stored discovery candidate. This is *not* a `Source` from lib/types.ts: it
 * cannot be rendered by the dashboard, it is never counted as evidence, and its
 * tier is always "lead" until a human accepts it through a separate, reviewed
 * editing step.
 */
export interface CandidateRecord {
  id: string;
  provenance: "discovered";
  created_at: string;
  discovered_by: {
    run_id: string;
    query_id: string;
    adapter: AdapterId;
  };
  source: {
    canonical_url: string;
    title: string;
    publisher: string;
    authors: string[];
    published_at: string | null;
    source_type: CandidateSourceType;
    /** Always "lead": a machine-found pointer is the weakest tier in the model. */
    source_tier: "lead";
  };
  retrieval: {
    /** null when only metadata was retrieved and no page/bytes were fetched. */
    retrieved_at: string | null;
    http_status: number | null;
    /** sha256 of the fetched bytes (or of the normalised body when bytes are unavailable). */
    content_hash: string | null;
    bytes: number | null;
    content_type: string | null;
  };
  status: CandidateStatus;
  /** Adapter-supplied summary, verbatim. Never rewritten into a claim. */
  summary: string;
  /** Set when the same canonical URL or content hash was already stored. */
  duplicate_of: string | null;
  triage: {
    decision: "accept-for-review" | "reject" | "duplicate";
    reason: string;
    at: string;
  } | null;
  notes: string[];
}

export interface DiscoveryOptions {
  /** Restrict to these configured queries; default is every enabled query. */
  queryIds?: string[];
  /** Restrict to these adapters; default is each query's own list. */
  adapters?: AdapterId[];
  /** Per-query cap override (still bounded by config.max_items_per_query). */
  limit?: number;
  /** Run adapters and build candidates, but store nothing. */
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
}

export interface DiscoveryQueryOutcome {
  query_id: string;
  adapters: AdapterResult[];
  candidates: CandidateRecord[];
  duplicates: number;
  /** Candidates dropped because they were already present from an earlier run. */
  skipped_existing: number;
}

export interface DiscoveryOutcome {
  run_id: string;
  started_at: string;
  finished_at: string;
  dry_run: boolean;
  queries: DiscoveryQueryOutcome[];
  totals: {
    candidates: number;
    duplicates: number;
    skipped_existing: number;
    adapter_failures: number;
    requests: number;
  };
}

export type Severity = "error" | "warn" | "info";

export type QualitySubjectKind =
  | "dataset"
  | "source"
  | "candidate"
  | "claim"
  | "evidence"
  | "forecast"
  | "system";

/**
 * One quality finding. Findings describe a problem and a remediation; they never
 * carry a change that was already applied. `auto_fixable` marks the narrow set of
 * maintenance actions that are safe because they cannot alter a claim: archiving a
 * stale candidate, or refreshing a retrieval timestamp.
 */
export interface QualityFinding {
  id: string;
  rule: string;
  severity: Severity;
  title: string;
  detail: string;
  subject: { kind: QualitySubjectKind; id?: string };
  evidence: Array<{ kind: "path" | "url" | "value"; value: string }>;
  remediation: string;
  auto_fixable: boolean;
}

export interface QualityCheck {
  rule: string;
  ok: boolean;
  findings: number;
  /**
   * How many subjects this rule actually evaluated (candidates read, evidence
   * considered, sources fetched). A pass with `inspected === 0` means the rule
   * had nothing to look at, which is not the same as "checked and fine".
   */
  inspected: number;
  duration_ms: number;
  /** Present when the check itself failed (network error, unreadable file, …). */
  error?: string;
}

export interface QualityOptions {
  /** Restrict to these rule ids. */
  rules?: string[];
  /** Cap how many subjects a rule inspects (network-bound rules). */
  limit?: number;
  /** Compute findings and report them, but store no run record. */
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
}

export interface QualityOutcome {
  run_id: string;
  started_at: string;
  finished_at: string;
  findings: QualityFinding[];
  counts: Record<Severity, number> & { total: number };
  checks: QualityCheck[];
}

/** A scheduled job as stored in the run index. */
export interface RunRecord {
  run_id: string;
  task: "discovery" | "quality" | "source-integrity" | "manual";
  started_at: string;
  finished_at: string;
  ok: boolean;
  summary: string;
  counts?: Record<string, number>;
  error?: string;
}

export interface ScheduleEntry {
  task: "discovery" | "quality";
  /** Five-field cron: minute hour day-of-month month day-of-week. */
  cron: string;
  enabled: boolean;
}

export interface ToolConfig {
  version: 1;
  userAgent: string;
  request_timeout_ms: number;
  max_items_per_query: number;
  queries: DiscoverQuery[];
  schedule: ScheduleEntry[];
  quality: {
    /** Candidates untouched for this many days are archived by the maintenance run. */
    candidate_max_age_days: number;
    /** Evidence records older than this many days that are still unreviewed are flagged. */
    unreviewed_evidence_days: number;
    /** Sources whose URL has not been re-checked for this long are flagged. */
    source_recheck_days: number;
    /** Number of sources a single integrity run may re-fetch. */
    integrity_batch: number;
    /** Hosts that must never be fetched by the integrity/audit path. */
    deny_hosts: string[];
  };
}
