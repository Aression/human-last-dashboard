/**
 * Tool registry for the evidence automation MCP server.
 *
 * Kept separate from the transport (`server.ts`) so the same dispatch can be
 * exercised by tests and by the CLI without speaking MCP first.
 *
 * Every tool that stores something says so in its description. Nothing here can
 * edit `lib/`, the dashboard dataset, or a published assessment.
 */
import path from "node:path";

import { dataset } from "../../../data/demo/dataset";
import { currentAssessment, evidenceForCapability, evidenceStats } from "../../../lib/data";
import { validateDataset } from "../../../lib/validate";
import { defaultConfigPath, isFetchableUrl, loadConfig } from "./config";
import { runDiscovery } from "./discovery";
import { runQuality } from "./quality";
import { renderQualityReport, summarize } from "./report";
import {
  listDirFiles,
  readJson,
  readJsonl,
  storePaths,
  type StorePaths,
} from "./store";
import type {
  AdapterId,
  CandidateRecord,
  DiscoverQuery,
  QualityFinding,
  QualityOutcome,
  RunRecord,
  Severity,
  ToolConfig,
} from "./contracts";

export const SERVER_NAME = "evidence-automation";
export const SERVER_VERSION = "0.1.0";

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  /** JSON Schema for arguments; validated by validateArgs before dispatch. */
  inputSchema: Record<string, unknown>;
  /** True when the call can write files under .evidence-mcp/. */
  mutating: boolean;
  handler: (args: Args, ctx: ToolContext) => Promise<ToolResult>;
}

export type Args = Record<string, unknown>;
export interface ToolResult {
  /** Structured payload; also rendered as text for clients that show text only. */
  data: unknown;
  summary: string;
}
export interface ToolContext {
  root: string;
  paths: StorePaths;
  loadConfig: () => Promise<ToolConfig>;
}

const str = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "string",
  description,
  ...extra,
});
const bool = (description: string) => ({ type: "boolean", description });
const int = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "integer",
  description,
  ...extra,
});

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const ADAPTER_ENUM = { type: "string", enum: ["arxiv", "github", "rss"] };

/* ------------------------------------------------------------------ helpers */

async function allCandidates(paths: StorePaths): Promise<CandidateRecord[]> {
  const days = await listDays(paths.candidates);
  const out: CandidateRecord[] = [];
  for (const day of days) {
    for (const file of await listDirFiles(path.join(paths.candidates, day))) {
      const record = await readJson<CandidateRecord>(path.join(paths.candidates, day, file));
      if (record) out.push(record);
    }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function listDays(dir: string): Promise<string[]> {
  const fs = await import("node:fs/promises");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function latestQualityRun(paths: StorePaths): Promise<QualityOutcome | null> {
  const files = await listDirFiles(paths.quality);
  if (files.length === 0) return null;
  const newest = files.sort().at(-1);
  return newest ? readJson<QualityOutcome>(path.join(paths.quality, newest)) : null;
}

/* ------------------------------------------------------------------- tools */

export function toolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "discovery_queries",
      title: "List configured discovery queries",
      description:
        "Show the discovery queries from tools/evidence-mcp/config/discovery.json with their intent, adapters, keywords and feeds. Read-only.",
      inputSchema: objectSchema({}),
      mutating: false,
      async handler(_args, ctx) {
        const config = await ctx.loadConfig();
        return {
          data: {
            config_path: defaultConfigPath(),
            queries: config.queries,
            schedule: config.schedule,
            limits: {
              request_timeout_ms: config.request_timeout_ms,
              max_items_per_query: config.max_items_per_query,
            },
          },
          summary: `${config.queries.length} queries: ${config.queries.map((q) => q.id).join(", ")}`,
        };
      },
    },
    {
      name: "discovery_run",
      title: "Run source discovery",
      description:
        "Fetch configured feeds/APIs, fetch each found page, and store candidates under .evidence-mcp/candidates/. Every candidate is provenance=discovered with source_tier=lead: a pointer for a human to review, never evidence. Writes files unless dry_run is true.",
      inputSchema: objectSchema({
        query_ids: { type: "array", items: { type: "string" }, description: "Restrict to these query ids." },
        adapters: { type: "array", items: ADAPTER_ENUM, description: "Restrict to these adapters." },
        limit: int("Per-query cap, still bounded by max_items_per_query.", { minimum: 1, maximum: 50 }),
        dry_run: bool("Run the adapters and build candidates, but store nothing."),
      }),
      mutating: true,
      async handler(args) {
        const outcome = await runDiscovery({
          queryIds: args.query_ids as string[] | undefined,
          adapters: args.adapters as AdapterId[] | undefined,
          limit: args.limit as number | undefined,
          dryRun: args.dry_run === true,
        });
        return {
          data: outcome,
          summary:
            `run ${outcome.run_id}: ${outcome.totals.candidates} candidates, ` +
            `${outcome.totals.duplicates} duplicates, ${outcome.totals.skipped_existing} already stored, ` +
            `${outcome.totals.adapter_failures} adapter failures`,
        };
      },
    },
    {
      name: "discovery_candidates",
      title: "List stored discovery candidates",
      description:
        "List candidates stored by previous discovery runs, newest first. Read-only: nothing here is evidence, and status only changes through discovery_triage.",
      inputSchema: objectSchema({
        status: {
          type: "string",
          enum: ["new", "duplicate", "triaged-review", "rejected", "archived"],
          description: "Filter by status.",
        },
        query_id: str("Filter by the query that produced them."),
        limit: int("Maximum records to return.", { minimum: 1, maximum: 200 }),
      }),
      mutating: false,
      async handler(args, ctx) {
        const limit = (args.limit as number | undefined) ?? 25;
        const all = await allCandidates(ctx.paths);
        const filtered = all.filter(
          (c) =>
            (!args.status || c.status === args.status) &&
            (!args.query_id || c.discovered_by.query_id === args.query_id),
        );
        return {
          data: { total: all.length, returned: Math.min(filtered.length, limit), candidates: filtered.slice(0, limit) },
          summary: `${filtered.length} matching candidates (of ${all.length} stored)`,
        };
      },
    },
    {
      name: "discovery_candidate",
      title: "Read one discovery candidate",
      description: "Read a single stored candidate by id, including its retrieval evidence. Read-only.",
      inputSchema: objectSchema({ candidate_id: str("Candidate id, e.g. cand-2026-abcdef12.") }, ["candidate_id"]),
      mutating: false,
      async handler(args, ctx) {
        const id = String(args.candidate_id);
        const all = await allCandidates(ctx.paths);
        const found = all.find((c) => c.id === id);
        if (!found) {
          return { data: { found: false, candidate_id: id }, summary: `no candidate ${id}` };
        }
        return { data: { found: true, candidate: found }, summary: `${id}: ${found.source.title}` };
      },
    },
    {
      name: "discovery_triage",
      title: "Record a triage decision on a candidate",
      description:
        "Record a human/agent decision on one candidate (accept-for-review, reject or duplicate) with a required reason. This changes candidate status only; it cannot create a source, claim or assessment. Writes a file.",
      inputSchema: objectSchema(
        {
          candidate_id: str("Candidate id."),
          decision: { type: "string", enum: ["accept-for-review", "reject", "duplicate"], description: "Decision." },
          reason: str("Why this decision was made; stored verbatim.", { minLength: 5 }),
        },
        ["candidate_id", "decision", "reason"],
      ),
      mutating: true,
      async handler(args, ctx) {
        const id = String(args.candidate_id);
        const decision = args.decision as "accept-for-review" | "reject" | "duplicate";
        const reason = String(args.reason);
        const days = await listDays(ctx.paths.candidates);
        for (const day of days) {
          const file = path.join(ctx.paths.candidates, day, `${id}.json`);
          const record = await readJson<CandidateRecord>(file);
          if (!record) continue;
          const status: CandidateRecord["status"] =
            decision === "accept-for-review" ? "triaged-review" : decision === "reject" ? "rejected" : "duplicate";
          const updated: CandidateRecord = {
            ...record,
            status,
            triage: { decision, reason, at: new Date().toISOString() },
          };
          const { writeJson } = await import("./store");
          await writeJson(file, updated);
          return {
            data: { candidate_id: id, status: updated.status, triage: updated.triage },
            summary: `${id} → ${status}`,
          };
        }
        return { data: { found: false, candidate_id: id }, summary: `no candidate ${id}` };
      },
    },
    {
      name: "quality_audit",
      title: "Run the quality maintenance audit",
      description:
        "Run the audit rules over the dashboard dataset and the discovery store: dataset validity, dangling references, stale/untriaged/duplicate candidates, unreviewed evidence, overdue forecasts, source reachability, provenance gaps. Findings carry a remediation but nothing is applied. Writes a run record unless dry_run is true.",
      inputSchema: objectSchema({
        rules: { type: "array", items: { type: "string" }, description: "Restrict to these rule ids." },
        limit: int("Cap subjects inspected by network-bound rules.", { minimum: 1, maximum: 100 }),
        dry_run: bool("Compute findings without storing the run."),
      }),
      mutating: true,
      async handler(args) {
        const outcome = await runQuality({
          rules: args.rules as string[] | undefined,
          limit: args.limit as number | undefined,
          dryRun: args.dry_run === true,
        });
        return {
          data: outcome,
          summary: summarize(outcome),
        };
      },
    },
    {
      name: "quality_findings",
      title: "List findings from the latest audit",
      description: "Return findings from the most recent stored audit, optionally filtered. Read-only.",
      inputSchema: objectSchema({
        severity: { type: "string", enum: ["error", "warn", "info"], description: "Filter by severity." },
        rule: str("Filter by rule id."),
        limit: int("Maximum findings.", { minimum: 1, maximum: 200 }),
      }),
      mutating: false,
      async handler(args, ctx) {
        const run = await latestQualityRun(ctx.paths);
        if (!run) {
          return { data: { run_id: null, findings: [] }, summary: "no audit has been stored yet" };
        }
        const filtered = run.findings.filter(
          (f: QualityFinding) =>
            (!args.severity || f.severity === (args.severity as Severity)) && (!args.rule || f.rule === args.rule),
        );
        const limit = (args.limit as number | undefined) ?? 50;
        return {
          data: { run_id: run.run_id, counts: run.counts, total: filtered.length, findings: filtered.slice(0, limit) },
          summary: `${filtered.length} findings in ${run.run_id} (${run.counts.error} error, ${run.counts.warn} warn, ${run.counts.info} info)`,
        };
      },
    },
    {
      name: "quality_report",
      title: "Render an audit as Markdown",
      description:
        "Render the most recent (or a named) audit as a Markdown report: checks table, findings by severity, remediation, and an explicit statement of what the report does not establish. Read-only.",
      inputSchema: objectSchema({
        run_id: str("Audit run id; defaults to the most recent."),
        max_findings: int("Cap findings per severity.", { minimum: 1, maximum: 500 }),
      }),
      mutating: false,
      async handler(args, ctx) {
        const run = args.run_id
          ? await readJson<QualityOutcome>(path.join(ctx.paths.quality, `${String(args.run_id)}.json`))
          : await latestQualityRun(ctx.paths);
        if (!run) return { data: { markdown: null }, summary: "no audit has been stored yet" };
        const markdown = renderQualityReport(run, { maxFindings: args.max_findings as number | undefined });
        return {
          data: { run_id: run.run_id, markdown },
          summary: `report for ${run.run_id} (${markdown.length} chars)`,
        };
      },
    },
    {
      name: "dataset_validate",
      title: "Validate the dashboard dataset",
      description:
        "Run the repository's own runtime validation (lib/validate.ts) and reference build (lib/data/index.ts) over the demo dataset in data/demo/dataset.ts, requiring demo provenance the way the build does. Read-only: reports violations, changes nothing.",
      inputSchema: objectSchema({}),
      mutating: false,
      async handler() {
        const violations = validateDataset(dataset, { expectedProvenance: "demo" });
        let selectorError: string | null = null;
        let derived: { capabilities: number; current_assessments: number; evidence: unknown } | null = null;
        try {
          // Touching every capability forces the reference lookups that throw on
          // dangling ids, which is the check that matters here.
          const capabilities = dataset.capabilities.map((c) => ({
            id: c.id,
            current: currentAssessment(c.id)?.id ?? null,
            evidence: evidenceForCapability(c.id).length,
          }));
          derived = {
            capabilities: capabilities.length,
            current_assessments: capabilities.filter((c) => c.current !== null).length,
            evidence: evidenceStats(),
          };
        } catch (error) {
          selectorError = error instanceof Error ? error.message : String(error);
        }
        return {
          data: { violations, selector_error: selectorError, derived, ok: violations.length === 0 && !selectorError },
          summary: violations.length === 0 && !selectorError
            ? `dataset valid (${dataset.capabilities.length} capabilities), references resolve`
            : `${violations.length} violations, selector error: ${selectorError ?? "none"}`,
        };
      },
    },
    {
      name: "automation_status",
      title: "Daemon and store status",
      description:
        "Report whether the background daemon is running, its schedule and next run times, store counts, and the configured adapters. Read-only.",
      inputSchema: objectSchema({}),
      mutating: false,
      async handler(_args, ctx) {
        const state = await readJson<Record<string, unknown>>(path.join(ctx.paths.state, "daemon.json"));
        const candidates = await allCandidates(ctx.paths);
        const runs = await readJsonl<RunRecord>(path.join(ctx.paths.runs, "index.jsonl"), 20);
        const config = await ctx.loadConfig();
        const byStatus: Record<string, number> = {};
        for (const c of candidates) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
        return {
          data: {
            daemon: state,
            schedule: config.schedule,
            candidates: { total: candidates.length, by_status: byStatus },
            recent_runs: runs,
            adapters: [...new Set(config.queries.flatMap((q: DiscoverQuery) => q.adapters))],
            store: ctx.paths.home,
          },
          summary: `${state ? `daemon ${state.running === true ? "running" : "stopped"}` : "daemon never started"}; ${candidates.length} candidates; ${runs.length} recent runs`,
        };
      },
    },
    {
      name: "runs_history",
      title: "Recent automation runs",
      description: "Read the run index (discovery, quality, integrity) newest first. Read-only.",
      inputSchema: objectSchema({
        task: { type: "string", enum: ["discovery", "quality", "source-integrity", "manual"], description: "Filter by task." },
        limit: int("Maximum records.", { minimum: 1, maximum: 200 }),
      }),
      mutating: false,
      async handler(args, ctx) {
        const limit = (args.limit as number | undefined) ?? 20;
        const runs = await readJsonl<RunRecord>(path.join(ctx.paths.runs, "index.jsonl"));
        const filtered = runs.filter((r) => !args.task || r.task === args.task).reverse().slice(0, limit);
        return { data: { total: runs.length, returned: filtered.length, runs: filtered }, summary: `${filtered.length} of ${runs.length} runs` };
      },
    },
  ];
}

/* --------------------------------------------------------------- dispatch */

export function validateArgs(
  schema: Record<string, unknown>,
  args: Args,
): { ok: true; value: Args } | { ok: false; error: string } {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];
  for (const key of required) {
    if (args[key] === undefined) return { ok: false, error: `missing required argument "${key}"` };
  }
  for (const [key, value] of Object.entries(args)) {
    const prop = properties[key];
    if (!prop) return { ok: false, error: `unknown argument "${key}"` };
    const type = prop.type as string | undefined;
    if (value === null || value === undefined) continue;
    const typeOk =
      type === "string"
        ? typeof value === "string"
        : type === "integer"
          ? Number.isInteger(value)
          : type === "number"
            ? typeof value === "number"
            : type === "boolean"
              ? typeof value === "boolean"
              : type === "array"
                ? Array.isArray(value)
                : type === "object"
                  ? typeof value === "object"
                  : true;
    if (!typeOk) return { ok: false, error: `argument "${key}" must be ${type}` };
    if (Array.isArray(prop.enum) && !prop.enum.includes(value as never)) {
      return { ok: false, error: `argument "${key}" must be one of ${(prop.enum as unknown[]).join(", ")}` };
    }
    const items = prop.items as Record<string, unknown> | undefined;
    if (items?.enum && Array.isArray(value)) {
      for (const item of value) {
        if (!(items.enum as unknown[]).includes(item)) {
          return { ok: false, error: `argument "${key}" contains invalid value "${String(item)}"` };
        }
      }
    }
    if (type === "string" && typeof value === "string") {
      const min = prop.minLength as number | undefined;
      if (min !== undefined && value.length < min) {
        return { ok: false, error: `argument "${key}" must be at least ${min} characters` };
      }
    }
  }
  return { ok: true, value: args };
}

export async function dispatchTool(
  name: string,
  args: Args,
  ctx?: Partial<ToolContext>,
): Promise<ToolResult> {
  const tool = toolDefinitions().find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool "${name}"`);
  const checked = validateArgs(tool.inputSchema, args);
  if (!checked.ok) throw new Error(`${name}: ${checked.error}`);
  const root = ctx?.root ?? (await import("./store")).findRepoRoot();
  const context: ToolContext = {
    root,
    paths: ctx?.paths ?? storePaths(root),
    loadConfig: ctx?.loadConfig ?? (() => loadConfig()),
  };
  return tool.handler(checked.value, context);
}

/** Tool list in the shape MCP's tools/list returns. */
export function listToolsForMcp(): Array<{
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean };
}> {
  return toolDefinitions().map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { readOnlyHint: !t.mutating },
  }));
}

/** Exposed for tests that need to check reachability rules without network. */
export function urlAllowed(url: string, config: ToolConfig): boolean {
  return isFetchableUrl(url, config.quality.deny_hosts);
}
