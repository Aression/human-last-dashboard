/**
 * Publishes what the local automation store currently holds into
 * `data/automation/snapshot.json`, which the dashboard renders.
 *
 * Why a committed snapshot rather than a live read: the dashboard is a static
 * Next.js site deployed to Vercel, and `.evidence-mcp/` is gitignored and absent
 * from any deployment. Publishing is therefore an explicit step — run the
 * command, review the diff, commit it. The page shows `generated_at` so a reader
 * can tell how old the view is.
 *
 * This module reads candidates and audit runs and writes one JSON file. It never
 * promotes a lead, never touches `data/demo/dataset.ts`, and never calls a model.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

import type {
  AutomationAudit,
  AutomationLead,
  AutomationRun,
  AutomationSnapshot,
  CandidateStatus,
} from "../../../lib/automation";
import { DISCOVERED_LEAD_NOTE } from "../../../lib/automation-copy";
import type { CandidateRecord, QualityOutcome, RunRecord } from "./contracts";
import { ensureDir, readJson, readJsonl, storePaths, writeJson } from "./store";

export interface SnapshotBuildOptions {
  /** Repository root; defaults to the store resolver's own detection. */
  storeRoot?: string;
  /** Destination file; defaults to `<repo>/data/automation/snapshot.json`. */
  outPath?: string;
  /** How many leads to embed as rows. Aggregates always cover every stored record. */
  maxItems?: number;
  now?: () => Date;
}

export interface SnapshotBuildResult {
  snapshot: AutomationSnapshot;
  outPath: string;
  bytes: number;
  /** Records on disk, including any that could not be parsed. */
  storedRecords: number;
  unreadableRecords: string[];
}

const DEFAULT_MAX_ITEMS = 60;

/** Candidate files are written as `candidates/<YYYY-MM-DD>/<id>.json`, with older
 * loose files directly under `candidates/`. Walk both layouts. */
async function listCandidateFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listCandidateFiles(full)));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(full);
  }
  return files.sort();
}

function toLead(record: CandidateRecord): AutomationLead {
  const error = typeof record.retrieval?.error === "string" && record.retrieval.error.length > 0;
  const status: CandidateStatus = (record.status ?? "new") as CandidateStatus;
  return {
    id: record.id,
    title: record.source.title,
    url: record.source.canonical_url,
    publisher: record.source.publisher,
    published_at: record.source.published_at ?? null,
    source_type: record.source.source_type,
    adapter: record.discovered_by.adapter,
    query_id: record.discovered_by.query_id,
    created_at: record.created_at,
    status,
    http_status: typeof record.retrieval?.http_status === "number" ? record.retrieval.http_status : null,
    content_hash: record.retrieval?.content_hash ?? null,
    note: error ? record.retrieval.error! : null,
  };
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Why a lead has no usable page, in the reader's vocabulary. A null status with
 * no error means the page was never fetched, which is not a failure.
 */
function retrievalReason(record: CandidateRecord): string | null {
  const status = record.retrieval?.http_status;
  const error = record.retrieval?.error;
  const statusFailed = typeof status === "number" && status >= 400;
  if (!statusFailed && !error) return null;
  if (status === 429) return "rate limited (HTTP 429)";
  if (statusFailed) return `HTTP ${status}`;
  if (typeof error === "string" && /timeout|timed out/i.test(error)) return "fetch timed out";
  return "other fetch error";
}

/** Biggest group first, then alphabetical, so the page's tables are stable. */
function sortedGroups(counts: Map<string, number>): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function newestAudit(qualityDir: string): Promise<QualityOutcome | null> {
  const files = await listCandidateFiles(qualityDir);
  let newest: QualityOutcome | null = null;
  for (const file of files) {
    const outcome = await readJson<QualityOutcome>(file);
    if (!outcome || typeof outcome.run_id !== "string") continue;
    if (!newest || Date.parse(outcome.finished_at) > Date.parse(newest.finished_at)) newest = outcome;
  }
  return newest;
}

export async function buildAutomationSnapshot(
  options: SnapshotBuildOptions = {},
): Promise<SnapshotBuildResult> {
  const paths = storePaths(options.storeRoot);
  const outPath = options.outPath ?? path.join(paths.root, "data", "automation", "snapshot.json");
  const now = options.now ?? (() => new Date());
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;

  const files = await listCandidateFiles(paths.candidates);
  const records: CandidateRecord[] = [];
  const unreadable: string[] = [];
  for (const file of files) {
    const record = await readJson<CandidateRecord>(file);
    if (!record?.id || !record.source?.canonical_url) unreadable.push(path.relative(paths.root, file));
    else records.push(record);
  }
  records.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const index = await readJsonl<RunRecord>(path.join(paths.runs, "index.jsonl"));
  const runs: AutomationRun[] = index
    .map((run) => ({
      run_id: run.run_id,
      task: run.task,
      started_at: run.started_at,
      ok: run.ok,
      summary: run.summary,
    }))
    .reverse()
    .slice(0, 12);

  const byStatus = countBy(records, (record) => record.status ?? "new");
  const byAdapter = sortedGroups(countBy(records, (record) => record.discovered_by.adapter)).map(
    ([adapter, count]) => ({ adapter, count }),
  );
  const byQuery = sortedGroups(countBy(records, (record) => record.discovered_by.query_id)).map(
    ([query_id, count]) => ({ query_id, count }),
  );
  const byDay = [...countBy(records, (record) => record.created_at.slice(0, 10)).entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const auditOutcome = await newestAudit(paths.quality);
  const audit: AutomationAudit | null = auditOutcome
    ? {
        run_id: auditOutcome.run_id,
        started_at: auditOutcome.started_at,
        finished_at: auditOutcome.finished_at,
        counts: {
          error: auditOutcome.counts.error,
          warn: auditOutcome.counts.warn,
          info: auditOutcome.counts.info,
          total: auditOutcome.counts.total,
        },
        inspected_total: auditOutcome.checks.reduce((acc, check) => acc + check.inspected, 0),
        checks: auditOutcome.checks.map((check) => ({
          rule: check.rule,
          ok: check.ok,
          findings: check.findings,
          inspected: check.inspected,
          duration_ms: check.duration_ms,
          ...(check.error ? { error: check.error } : {}),
        })),
      }
    : null;

  const items = records.slice(0, maxItems).map(toLead);
  const discoveryRuns = index.filter((run) => run.task === "discovery").length;
  const qualityRuns = index.filter((run) => run.task === "quality").length;
  const runTimes = index.map((run) => run.started_at).filter((value) => typeof value === "string").sort();

  const snapshot: AutomationSnapshot = {
    schema_version: 1,
    generated_at: now().toISOString(),
    generated_by: "node --import tsx tools/evidence-mcp/src/cli.ts snapshot",
    disclaimer: DISCOVERED_LEAD_NOTE,
    store: {
      runs: index.length,
      discovery_runs: discoveryRuns,
      quality_runs: qualityRuns,
      first_run_at: runTimes[0] ?? null,
      last_run_at: runTimes[runTimes.length - 1] ?? null,
    },
    candidates: {
      total: records.length,
      stored_records: files.length,
      by_status: Object.fromEntries([...byStatus.entries()]) as Partial<Record<CandidateStatus, number>>,
      by_adapter: byAdapter,
      by_query: byQuery,
      by_day: byDay,
      retrieval: {
        with_content_hash: records.filter((record) => Boolean(record.retrieval?.content_hash)).length,
        fetch_errors: records.filter((record) => retrievalReason(record) !== null).length,
        by_reason: sortedGroups(
          countBy(
            records.map((record) => ({ record, reason: retrievalReason(record) })),
            (entry) => entry.reason ?? "",
          ),
        )
          .filter(([reason]) => reason.length > 0)
          .map(([reason, count]) => ({ reason, count })),
      },
      items,
    },
    audit,
    runs,
  };

  await ensureDir(path.dirname(outPath));
  await writeJson(outPath, snapshot);
  const bytes = Buffer.byteLength(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return { snapshot, outPath, bytes, storedRecords: files.length, unreadableRecords: unreadable };
}
