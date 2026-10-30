/**
 * Configuration loading.
 *
 * The tool ships one committed config (`tools/evidence-mcp/config/discovery.json`)
 * and accepts an override path through `EVIDENCE_MCP_CONFIG`. An override must be
 * a complete file: partial configs are rejected rather than merged, because a
 * silently missing `quality` block would quietly disable maintenance.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AdapterId, DiscoverQuery, ScheduleEntry, ToolConfig } from "./contracts";

export const ADAPTER_IDS: AdapterId[] = ["arxiv", "github", "rss"];

/**
 * The committed config sits next to the code that reads it, independent of the
 * store root: tests point EVIDENCE_MCP_ROOT at a temp directory for writes, but must
 * still read the real query definitions.
 */
export function sourceConfigPath(): string {
  const here = import.meta.dirname ?? path.resolve("tools/evidence-mcp/src");
  return path.join(here, "..", "config", "discovery.json");
}

export function defaultConfigPath(): string {
  return process.env.EVIDENCE_MCP_CONFIG
    ? path.resolve(process.env.EVIDENCE_MCP_CONFIG)
    : sourceConfigPath();
}

export async function loadConfig(configPath: string = defaultConfigPath()): Promise<ToolConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const config = parseConfig(parsed, configPath);
  return config;
}

/** Throws with the offending field named: a broken config must never look like a quiet run. */
export function parseConfig(value: unknown, source = "<inline>"): ToolConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${source}: config must be a JSON object`);
  }
  const c = value as Partial<ToolConfig>;
  if (c.version !== 1) throw new Error(`${source}: unsupported config version ${String(c.version)}`);
  if (typeof c.userAgent !== "string" || c.userAgent.trim().length < 10) {
    throw new Error(`${source}: userAgent must identify the tool`);
  }
  const timeout = c.request_timeout_ms;
  if (typeof timeout !== "number" || timeout < 1000 || timeout > 120000) {
    throw new Error(`${source}: request_timeout_ms must be between 1000 and 120000`);
  }
  const cap = c.max_items_per_query;
  if (typeof cap !== "number" || cap < 1 || cap > 50) {
    throw new Error(`${source}: max_items_per_query must be between 1 and 50`);
  }
  if (!Array.isArray(c.queries) || c.queries.length === 0) {
    throw new Error(`${source}: queries must be a non-empty array`);
  }
  const seen = new Set<string>();
  const queries = c.queries.map((q, i) => parseQuery(q, `${source}: queries[${i}]`, cap));
  for (const q of queries) {
    if (seen.has(q.id)) throw new Error(`${source}: duplicate query id "${q.id}"`);
    seen.add(q.id);
  }
  const schedule = parseSchedule(c.schedule, `${source}: schedule`);
  const quality = parseQuality(c.quality, `${source}: quality`);
  return {
    version: 1,
    userAgent: c.userAgent,
    request_timeout_ms: timeout,
    max_items_per_query: cap,
    queries,
    schedule,
    quality,
  };
}

function parseQuery(value: unknown, where: string, cap: number): DiscoverQuery {
  if (typeof value !== "object" || value === null) throw new Error(`${where}: must be an object`);
  const q = value as Partial<DiscoverQuery>;
  if (typeof q.id !== "string" || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(q.id)) {
    throw new Error(`${where}: id must be a lowercase slug`);
  }
  if (typeof q.title !== "string" || q.title.trim().length < 3) {
    throw new Error(`${where}: title is required`);
  }
  if (typeof q.intent !== "string" || q.intent.trim().length < 10) {
    throw new Error(`${where}: intent must explain why this query exists`);
  }
  if (!Array.isArray(q.adapters) || q.adapters.length === 0) {
    throw new Error(`${where}: adapters must be a non-empty array`);
  }
  for (const adapter of q.adapters) {
    if (!ADAPTER_IDS.includes(adapter)) throw new Error(`${where}: unknown adapter "${adapter}"`);
  }
  if (q.adapters.includes("rss") && (!Array.isArray(q.feeds) || q.feeds.length === 0)) {
    throw new Error(`${where}: the rss adapter needs at least one feed URL`);
  }
  if (!Array.isArray(q.keywords) || q.keywords.length === 0) {
    throw new Error(`${where}: keywords must be a non-empty array`);
  }
  if (!Array.isArray(q.capability_ids)) throw new Error(`${where}: capability_ids must be an array`);
  const limit = typeof q.limit === "number" ? Math.floor(q.limit) : cap;
  if (limit < 1) throw new Error(`${where}: limit must be positive`);
  return {
    id: q.id,
    title: q.title,
    intent: q.intent,
    adapters: q.adapters,
    keywords: q.keywords.map((k) => String(k)),
    capability_ids: q.capability_ids.map((k) => String(k)),
    limit: Math.min(limit, cap),
    feeds: q.feeds?.map((f) => String(f)),
  };
}

function parseSchedule(value: unknown, where: string): ScheduleEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${where}: must be an array`);
  return value.map((entry, i) => {
    const e = entry as Partial<ScheduleEntry>;
    if (e.task !== "discovery" && e.task !== "quality") {
      throw new Error(`${where}[${i}]: task must be "discovery" or "quality"`);
    }
    if (typeof e.cron !== "string" || e.cron.trim().split(/\s+/).length !== 5) {
      throw new Error(`${where}[${i}]: cron must have five fields`);
    }
    return { task: e.task, cron: e.cron, enabled: e.enabled !== false };
  });
}

function parseQuality(value: unknown, where: string): ToolConfig["quality"] {
  if (typeof value !== "object" || value === null) throw new Error(`${where}: required`);
  const q = value as Partial<ToolConfig["quality"]>;
  const positive = (n: unknown, field: string, max = 3650): number => {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > max) {
      throw new Error(`${where}: ${field} must be a positive number`);
    }
    return Math.floor(n);
  };
  if (!Array.isArray(q.deny_hosts) || q.deny_hosts.length === 0) {
    throw new Error(`${where}: deny_hosts must list hosts that must never be fetched`);
  }
  return {
    candidate_max_age_days: positive(q.candidate_max_age_days, "candidate_max_age_days"),
    unreviewed_evidence_days: positive(q.unreviewed_evidence_days, "unreviewed_evidence_days"),
    source_recheck_days: positive(q.source_recheck_days, "source_recheck_days"),
    integrity_batch: positive(q.integrity_batch, "integrity_batch", 100),
    deny_hosts: q.deny_hosts.map((h) => String(h).toLowerCase()),
  };
}

/** True when a URL may be fetched by this tool. Blocks loopback and link-local. */
export function isFetchableUrl(raw: string, denyHosts: string[]): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (denyHosts.includes(host)) return false;
  if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host === "::1" || host.endsWith(".local")) return false;
  return true;
}
