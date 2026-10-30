/**
 * Discovery run: turn configured queries into stored candidate leads.
 *
 * Provenance rules this file enforces (AGENTS.md rules 2, 3, 9, 10):
 *
 * - A candidate is always `provenance: "discovered"` and `source_tier: "lead"`.
 *   Nothing here can produce a curated source, an accepted evidence record, or a
 *   tier upgrade; that only happens through a reviewed edit.
 * - `retrieval` describes a GET this run actually performed. When the page was not
 *   fetched (duplicate, non-fetchable host, network failure) the fields stay null
 *   and the reason is written into `notes`. A content hash is never invented.
 * - Deduplication prefers silence over overwriting: an item whose canonical URL is
 *   already stored is counted in `skipped_existing` and left untouched, and a
 *   same-content item under a different URL is stored once with status "duplicate".
 *
 * All writes stay under `<repo>/.evidence-mcp/` (git-ignored) and are serialised
 * with a lock file so the daemon, a manual CLI run, and an agent tool call cannot
 * interleave. A dry run performs no writes at all — not even the lock file.
 */
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type {
  AdapterContext,
  AdapterId,
  AdapterResult,
  CandidateRecord,
  CandidateSourceType,
  DiscoverQuery,
  DiscoveryItem,
  DiscoveryOptions,
  DiscoveryOutcome,
  DiscoveryQueryOutcome,
  ToolConfig,
} from "./contracts";
import { getAdapter } from "./adapters/index";
import {
  ADAPTER_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  describeError,
  summaryExcerpt,
} from "./adapters/shared";
import { isFetchableUrl, loadConfig } from "./config";
import {
  appendJsonl,
  candidateId,
  dateStamp,
  ensureStore,
  findRepoRoot,
  listDirFiles,
  newRunId,
  normalizeUrl,
  nowIso,
  readJson,
  sha256,
  storePaths,
  withLock,
  writeJson,
  type StorePaths,
} from "./store";

/** Fallback user-agent for direct `fetchRetrieval` calls (runs pass the config one). */
export const DEFAULT_USER_AGENT = "human-last-dashboard-evidence-mcp/0.1 (+local agent)";

/** The `retrieval` block of a candidate record. */
export interface CandidateRetrieval {
  retrieved_at: string | null;
  http_status: number | null;
  content_hash: string | null;
  bytes: number | null;
  content_type: string | null;
}

/** `retrieval` plus the reason it is empty or partial; only the first part is stored. */
export interface RetrievalResult extends CandidateRetrieval {
  error: string | null;
}

/** A record that claims nothing was retrieved. Used when a GET is skipped. */
export const EMPTY_RETRIEVAL: CandidateRetrieval = {
  retrieved_at: null,
  http_status: null,
  content_hash: null,
  bytes: null,
  content_type: null,
};

export interface FetchRetrievalOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
  now?: () => Date;
}

/**
 * GET one URL and describe what came back.
 *
 * The hash is sha256 of the bytes this process actually captured (capped at
 * `maxBytes`). A non-2xx response records its status and body size but **no hash**:
 * an error page is not the artifact, and hashing it would let a duplicate check
 * match two different failures.
 */
export async function fetchRetrieval(
  url: string,
  opts: FetchRetrievalOptions = {},
): Promise<RetrievalResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const now = opts.now ?? (() => new Date());
  const timeoutMs = opts.timeoutMs ?? ADAPTER_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES;
  const empty: RetrievalResult = { ...EMPTY_RETRIEVAL, error: null };

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": opts.userAgent ?? DEFAULT_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { ...empty, error: `retrieval failed: ${describeError(error)}` };
  }

  const contentType = response.headers?.get("content-type") ?? null;
  let buffer: Uint8Array;
  try {
    buffer = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return {
      ...empty,
      retrieved_at: nowIso(now),
      http_status: response.status,
      content_type: contentType,
      error: `response body could not be read: ${describeError(error)}`,
    };
  }

  const truncated = buffer.byteLength > maxBytes;
  const captured = truncated ? buffer.subarray(0, maxBytes) : buffer;
  const truncatedNote = truncated ? `response truncated at ${maxBytes} bytes before hashing` : null;

  if (response.status < 200 || response.status > 299) {
    return {
      retrieved_at: nowIso(now),
      http_status: response.status,
      content_hash: null,
      bytes: captured.byteLength,
      content_type: contentType,
      error: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${
        truncatedNote ? `; ${truncatedNote}` : ""
      }`,
    };
  }

  return {
    retrieved_at: nowIso(now),
    http_status: response.status,
    content_hash: sha256(captured),
    bytes: captured.byteLength,
    content_type: contentType,
    error: truncatedNote,
  };
}

/** Already-stored candidates, indexed for cross-run duplicate detection. */
interface StoredIndex {
  byUrl: Map<string, string>;
  byHash: Map<string, string>;
}

async function loadStoredIndex(paths: StorePaths): Promise<StoredIndex> {
  const index: StoredIndex = { byUrl: new Map(), byHash: new Map() };
  let entries: Dirent[];
  try {
    entries = await readdir(paths.candidates, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return index;
    throw error;
  }
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(paths.candidates, String(entry.name)));
  for (const dir of dirs) {
    for (const file of await listDirFiles(dir)) {
      const record = await readJson<CandidateRecord>(path.join(dir, file));
      if (!record || typeof record.id !== "string") continue;
      const canonical = record.source?.canonical_url;
      if (typeof canonical === "string") index.byUrl.set(normalizeUrl(canonical), record.id);
      const hash = record.retrieval?.content_hash;
      if (typeof hash === "string") index.byHash.set(hash, record.id);
    }
  }
  return index;
}

/** Resolve `options.queryIds` against the config; an unknown id is an error, not a no-op. */
export function selectQueries(config: ToolConfig, queryIds?: string[]): DiscoverQuery[] {
  if (!queryIds) return config.queries;
  if (queryIds.length === 0) return [];
  const byId = new Map(config.queries.map((query) => [query.id, query]));
  return queryIds.map((id) => {
    const query = byId.get(id);
    if (!query) throw new Error(`unknown discovery query "${id}"`);
    return query;
  });
}

/**
 * Coarse source-type guess. Deliberately conservative: a feed entry is only
 * called a benchmark/report/announcement when its own *title* says so — summary
 * prose routinely mentions a "benchmark result" in a commentary post that is not
 * a benchmark — and everything else stays "unknown" for a reviewer to refine.
 */
export function guessSourceType(adapter: AdapterId, item: DiscoveryItem): CandidateSourceType {
  if (adapter === "arxiv") return "paper";
  if (adapter === "github") return "repository";
  const haystack = item.title.toLowerCase();
  if (/\bbenchmarks?\b/.test(haystack)) return "benchmark";
  if (/\b(technical report|white ?paper|report|survey|dataset)\b/.test(haystack)) return "report";
  if (/\b(announc\w*|introduc\w*|releas\w*|launch\w*|unveil\w*|now available)\b/.test(haystack)) {
    return "announcement";
  }
  return "unknown";
}

interface RunState {
  runId: string;
  runDate: string;
  now: () => Date;
  fetchImpl: typeof fetch;
  config: ToolConfig;
  paths: StorePaths;
  dryRun: boolean;
  stored: StoredIndex;
  /** Canonical URL → candidate id created earlier in this run. */
  seenUrls: Map<string, string>;
  /** Content hash → candidate id created earlier in this run. */
  seenHashes: Map<string, string>;
  /** Candidate ids whose JSON file was already written by this run. */
  writtenIds: Set<string>;
}

interface ItemOutcome {
  record: CandidateRecord | null;
  duplicate: boolean;
  skippedExisting: boolean;
  /** False for records whose id would collide with a file this run already wrote. */
  writeFile: boolean;
}

function buildRecord(input: {
  state: RunState;
  query: DiscoverQuery;
  adapter: AdapterId;
  item: DiscoveryItem;
  canonicalUrl: string;
  id: string;
  status: CandidateRecord["status"];
  duplicateOf: string | null;
  retrieval: CandidateRetrieval;
  summary: string;
  notes: string[];
}): CandidateRecord {
  return {
    id: input.id,
    provenance: "discovered",
    created_at: nowIso(input.state.now),
    discovered_by: {
      run_id: input.state.runId,
      query_id: input.query.id,
      adapter: input.adapter,
    },
    source: {
      canonical_url: input.canonicalUrl,
      title: input.item.title,
      publisher: input.item.publisher,
      authors: input.item.authors,
      published_at: input.item.published_at,
      source_type: guessSourceType(input.adapter, input.item),
      source_tier: "lead",
    },
    retrieval: input.retrieval,
    status: input.status,
    // Defence in depth: an adapter may hand over a full article body (a feed puts the
    // whole post in `<content:encoded>`), so the excerpt is enforced here too. It is
    // always derived from the item the publisher supplied — never from a fetched page,
    // so an HTTP error body can never become a candidate's summary — and falls back to
    // the title rather than storing an empty string.
    summary: summaryExcerpt(input.summary, input.item.title),
    duplicate_of: input.duplicateOf,
    triage: null,
    notes: input.notes,
  };
}

async function processItem(
  state: RunState,
  query: DiscoverQuery,
  adapterId: AdapterId,
  item: DiscoveryItem,
): Promise<ItemOutcome> {
  const none: ItemOutcome = { record: null, duplicate: false, skippedExisting: false, writeFile: false };
  if (typeof item.url !== "string" || item.url.trim().length === 0) return none;
  const canonicalUrl = normalizeUrl(item.url);

  // A host the tool refuses to fetch cannot be a retrievable lead.
  if (!isFetchableUrl(item.url, state.config.quality.deny_hosts)) return none;

  const id = candidateId(canonicalUrl, state.now());

  // Same URL already seen in this run: record the repeat, do not re-fetch.
  const seenInRun = state.seenUrls.get(canonicalUrl);
  if (seenInRun) {
    const record = buildRecord({
      state,
      query,
      adapter: adapterId,
      item,
      canonicalUrl,
      id,
      status: "duplicate",
      duplicateOf: seenInRun,
      retrieval: { ...EMPTY_RETRIEVAL },
      summary: item.summary,
      notes: [
        `duplicate within this run: canonical URL already collected as ${seenInRun}; page not fetched again`,
      ],
    });
    // Same canonical URL means same candidate id, so writing a file would overwrite
    // the first record. The repeat is still indexed in the run log.
    return { record, duplicate: true, skippedExisting: false, writeFile: false };
  }

  // Same URL stored by an earlier run: leave the existing record untouched.
  const storedUrlOwner = state.stored.byUrl.get(canonicalUrl);
  if (storedUrlOwner) {
    state.seenUrls.set(canonicalUrl, storedUrlOwner);
    return { record: null, duplicate: false, skippedExisting: true, writeFile: false };
  }

  const retrieval = await fetchRetrieval(item.url, {
    fetchImpl: state.fetchImpl,
    userAgent: state.config.userAgent,
    now: state.now,
  });
  const notes: string[] = [];
  if (retrieval.error) notes.push(`retrieval: ${retrieval.error}`);

  const hashOwner = retrieval.content_hash
    ? state.seenHashes.get(retrieval.content_hash) ?? state.stored.byHash.get(retrieval.content_hash)
    : undefined;

  state.seenUrls.set(canonicalUrl, id);
  // Keep the FIRST owner of a content hash: every later copy must point at the one
  // record that actually stored it, not at the previous duplicate.
  if (retrieval.content_hash && !state.seenHashes.has(retrieval.content_hash)) {
    state.seenHashes.set(retrieval.content_hash, id);
  }

  if (hashOwner) {
    notes.push(`same content_hash as ${hashOwner} (different URL)`);
    const record = buildRecord({
      state,
      query,
      adapter: adapterId,
      item,
      canonicalUrl,
      id,
      status: "duplicate",
      duplicateOf: hashOwner,
      retrieval,
      summary: item.summary,
      notes,
    });
    return { record, duplicate: true, skippedExisting: false, writeFile: !state.writtenIds.has(id) };
  }

  const record = buildRecord({
    state,
    query,
    adapter: adapterId,
    item,
    canonicalUrl,
    id,
    status: "new",
    duplicateOf: null,
    retrieval,
    summary: item.summary,
    notes,
  });
  return { record, duplicate: false, skippedExisting: false, writeFile: !state.writtenIds.has(id) };
}

async function persistCandidate(
  state: RunState,
  query: DiscoverQuery,
  adapterId: AdapterId,
  record: CandidateRecord,
  writeFile: boolean,
): Promise<void> {
  const file = path.join(state.paths.candidates, state.runDate, `${record.id}.json`);
  if (writeFile) {
    await writeJson(file, record);
    state.writtenIds.add(record.id);
  }
  await appendJsonl(path.join(state.paths.runs, "candidates.jsonl"), {
    run_id: state.runId,
    candidate_id: record.id,
    query_id: query.id,
    adapter: adapterId,
    status: record.status,
    canonical_url: record.source.canonical_url,
    content_hash: record.retrieval.content_hash,
    duplicate_of: record.duplicate_of,
    file: writeFile ? path.relative(state.paths.root, file) : null,
    at: record.created_at,
  });
}

async function runQuery(
  state: RunState,
  query: DiscoverQuery,
  options: DiscoveryOptions,
): Promise<DiscoveryQueryOutcome> {
  const limit = Math.min(
    options.limit ?? query.limit,
    state.config.max_items_per_query,
  );
  const selected = query.adapters.filter(
    (adapterId) => !options.adapters || options.adapters.includes(adapterId),
  );

  const outcomes: DiscoveryQueryOutcome = {
    query_id: query.id,
    adapters: [],
    candidates: [],
    duplicates: 0,
    skipped_existing: 0,
  };

  for (const adapterId of selected) {
    let result: AdapterResult;
    try {
      const adapter = getAdapter(adapterId);
      const ctx: AdapterContext = {
        query,
        limit,
        fetchImpl: state.fetchImpl,
        now: state.now,
        userAgent: state.config.userAgent,
      };
      result = await adapter.run(ctx);
    } catch (error) {
      // An adapter bug degrades this query, it does not abort the run.
      result = {
        adapter: adapterId,
        ok: false,
        items: [],
        requests: 0,
        duration_ms: 0,
        error: describeError(error),
      };
    }
    outcomes.adapters.push(result);
    if (!result.ok) continue;

    for (const item of result.items) {
      const outcome = await processItem(state, query, adapterId, item);
      if (outcome.record) {
        outcomes.candidates.push(outcome.record);
        if (outcome.duplicate) outcomes.duplicates += 1;
        if (!state.dryRun) {
          await persistCandidate(state, query, adapterId, outcome.record, outcome.writeFile);
        }
      } else if (outcome.skippedExisting) {
        outcomes.skipped_existing += 1;
      }
    }
  }

  return outcomes;
}

/**
 * Run discovery for the configured queries.
 *
 * Writes (candidate files, the candidate index, the run outcome) are skipped
 * entirely for `dryRun`, and the run lock is not taken either: a dry run must be
 * safe to execute against a repository it does not own.
 */
export async function runDiscovery(options: DiscoveryOptions = {}): Promise<DiscoveryOutcome> {
  const config = await loadConfig();
  const root = findRepoRoot();
  const paths = storePaths(root);
  const now = () => new Date();
  const startedAt = nowIso(now);
  const runId = newRunId("discovery", new Date(startedAt));
  const dryRun = options.dryRun === true;

  const execute = async (): Promise<DiscoveryOutcome> => {
    const queries = selectQueries(config, options.queryIds);
    const state: RunState = {
      runId,
      runDate: dateStamp(new Date(startedAt)),
      now,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      config,
      paths,
      dryRun,
      stored: await loadStoredIndex(paths),
      seenUrls: new Map(),
      seenHashes: new Map(),
      writtenIds: new Set(),
    };

    const queryOutcomes: DiscoveryQueryOutcome[] = [];
    for (const query of queries) {
      queryOutcomes.push(await runQuery(state, query, options));
    }

    const outcome: DiscoveryOutcome = {
      run_id: runId,
      started_at: startedAt,
      finished_at: nowIso(now),
      dry_run: dryRun,
      queries: queryOutcomes,
      totals: {
        candidates: queryOutcomes.reduce((sum, q) => sum + q.candidates.length, 0),
        duplicates: queryOutcomes.reduce((sum, q) => sum + q.duplicates, 0),
        skipped_existing: queryOutcomes.reduce((sum, q) => sum + q.skipped_existing, 0),
        adapter_failures: queryOutcomes.reduce(
          (sum, q) => sum + q.adapters.filter((result) => !result.ok).length,
          0,
        ),
        // Adapter requests only; each candidate's own retrieval GET is described by
        // its `retrieval` block and is intentionally not mixed into this counter.
        requests: queryOutcomes.reduce(
          (sum, q) => sum + q.adapters.reduce((inner, result) => inner + result.requests, 0),
          0,
        ),
      },
    };

    if (!dryRun) {
      await writeJson(path.join(paths.runs, "discovery", `${runId}.json`), outcome);
    }
    return outcome;
  };

  if (dryRun) return execute();

  await ensureStore(paths);
  return withLock(path.join(paths.state, "discovery.lock"), execute);
}
