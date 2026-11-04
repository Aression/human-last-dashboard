/**
 * Curation pipeline: the agent's working copy of the dashboard dataset, and the
 * reviewed step that publishes it.
 *
 * Two files live in the store (`.evidence-mcp/`, git-ignored):
 *
 *   curation/records.json    the working copy: a full `Dataset` (records + capabilities)
 *   data/curated/published.json  what the last publish wrote, when, and its hash
 *
 * and one committed contract: `data/curated/records.json` holds the records only,
 * with capabilities single-sourced in `data/capabilities.ts` so a taxonomy edit
 * cannot be silently duplicated into the published file.
 *
 * `curated` is a provenance claim about observation, not truth (AGENTS.md rules 2
 * and 4): a curated source has a real canonical_url, the retrieved_at of the
 * fetch, and the content_hash of the bytes that were read. Publishing does not
 * verify a claim; it refuses records that do not carry those observations, then a
 * human reviews the diff and commits it.
 */
import path from "node:path";

import { CAPABILITIES, TAXONOMY_VERSION } from "../../../data/capabilities";
import type { Dataset, Source } from "../../../lib/types";
import { validateDataset } from "../../../lib/validate";
import { nowIso, readJson, sha256, writeJson } from "./store";

/** The published file's shape: every `Dataset` collection except the taxonomy. */
export type CuratedRecords = Omit<Dataset, "capabilities">;

export interface CurationPaths {
  root: string;
  /** Store directory holding the working copy and publish state. */
  home: string;
  /** The agent's working copy of the full dataset. */
  records: string;
  /** State written by the last successful publish. */
  published: string;
  /** The committed records file the dashboard renders. */
  outPath: string;
}

export function curationPaths(root: string): CurationPaths {
  const home = path.join(root, ".evidence-mcp", "curation");
  return {
    root,
    home,
    records: path.join(home, "records.json"),
    published: path.join(root, "data", "curated", "published.json"),
    outPath: path.join(root, "data", "curated", "records.json"),
  };
}

/** The working copy, or null when none has been written yet. */
export async function readCuration(root: string): Promise<Dataset | null> {
  return readJson<Dataset>(curationPaths(root).records);
}

/** Write the working copy atomically; returns the file written. */
export async function writeCuration(root: string, dataset: Dataset): Promise<string> {
  const file = curationPaths(root).records;
  await writeJson(file, dataset);
  return file;
}

export interface CurationCounts {
  sources: number;
  claims: number;
  evidence: number;
  capabilities: number;
  assessments: number;
  proposals: number;
  events: number;
  attributions: number;
  forecasts: number;
  questions: number;
  total: number;
}

const countOf = (items: unknown): number => (Array.isArray(items) ? items.length : 0);

/** Records per collection. Counts what is there; it is not a quality score. */
export function curationSummary(dataset: Dataset): CurationCounts {
  const counts = {
    sources: countOf(dataset?.sources),
    claims: countOf(dataset?.claims),
    evidence: countOf(dataset?.evidence),
    capabilities: countOf(dataset?.capabilities),
    assessments: countOf(dataset?.assessments),
    proposals: countOf(dataset?.proposals),
    events: countOf(dataset?.events),
    attributions: countOf(dataset?.attributions),
    forecasts: countOf(dataset?.forecasts),
    questions: countOf(dataset?.questions),
  };
  return { ...counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}

/** Strip the taxonomy: capabilities stay in `data/capabilities.ts`, never in JSON. */
export function recordsOf(dataset: Dataset): CuratedRecords {
  const {
    label,
    taxonomy_version,
    sources,
    claims,
    evidence,
    assessments,
    proposals,
    events,
    attributions,
    forecasts,
    questions,
  } = dataset;
  return {
    label,
    taxonomy_version,
    sources,
    claims,
    evidence,
    assessments,
    proposals,
    events,
    attributions,
    forecasts,
    questions,
  };
}

const HEX_DIGEST = /^[a-f0-9]{32,}$/i;

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * What "curated" adds on top of lib/validate.ts: the page itself was observed.
 * `validateDataset` already refuses demo records in a curated dataset and refuses
 * a content_hash without a canonical_url; these are the fields it cannot judge.
 */
export function sourceViolations(sources: Source[]): string[] {
  const violations: string[] = [];
  for (const source of sources) {
    if (!isHttpUrl(source.canonical_url)) {
      violations.push(
        `source ${source.id}: curated records need an observed canonical_url (http or https), got ${JSON.stringify(source.canonical_url)}`,
      );
    }
    if (typeof source.retrieved_at !== "string" || source.retrieved_at.length === 0) {
      violations.push(
        `source ${source.id}: curated records need the retrieved_at of the fetch, got ${JSON.stringify(source.retrieved_at)}`,
      );
    }
    if (typeof source.content_hash !== "string" || !HEX_DIGEST.test(source.content_hash)) {
      violations.push(
        `source ${source.id}: curated records need the content_hash of the fetched bytes (a hex digest), got ${JSON.stringify(source.content_hash)}`,
      );
    }
  }
  return violations;
}

export interface PublishOptions {
  root: string;
  /** Destination; defaults to `<root>/data/curated/records.json`. */
  outPath?: string;
  now?: () => Date;
}

export interface PublishResult {
  ok: boolean;
  written: boolean;
  outPath: string;
  /** Every reason publishing was refused; empty exactly when `ok` is true. */
  violations: string[];
  counts: CurationCounts;
  publishedAt: string | null;
}

export interface PublishedState {
  out_path: string;
  published_at: string;
  content_hash: string;
  counts: CurationCounts;
}

const EMPTY_COUNTS: CurationCounts = {
  sources: 0,
  claims: 0,
  evidence: 0,
  capabilities: 0,
  assessments: 0,
  proposals: 0,
  events: 0,
  attributions: 0,
  forecasts: 0,
  questions: 0,
  total: 0,
};

export async function readPublishedState(root: string): Promise<PublishedState | null> {
  return readJson<PublishedState>(curationPaths(root).published);
}

/**
 * Validate the working copy and, only if it passes, write the records file.
 *
 * Refusals are returned as violations and nothing is written: a partial publish
 * would put records the dashboard cannot resolve into the committed dataset.
 */
export async function publishCuration(options: PublishOptions): Promise<PublishResult> {
  const root = options.root;
  const paths = curationPaths(root);
  const outPath = options.outPath ?? paths.outPath;
  const now = options.now ?? (() => new Date());

  const written = await readCuration(root);
  if (!written) {
    return {
      ok: false,
      written: false,
      outPath,
      violations: [`no curation working copy at ${paths.records}; write one with writeCuration first`],
      counts: EMPTY_COUNTS,
      publishedAt: null,
    };
  }

  // A working copy may be records-only (the shape of the committed file) or carry
  // the taxonomy. Compose the taxonomy from `data/capabilities.ts` either way, so a
  // records-only copy validates its `capability_ids` instead of reporting every one
  // of them as dangling.
  const dataset: Dataset =
    Array.isArray(written.capabilities) && written.capabilities.length > 0
      ? written
      : { ...written, capabilities: CAPABILITIES };

  const counts = curationSummary(dataset);
  const violations = [
    ...validateDataset(dataset, { expectedProvenance: "curated" }),
    ...sourceViolations(Array.isArray(dataset.sources) ? dataset.sources : []),
  ];
  if (dataset.taxonomy_version !== TAXONOMY_VERSION) {
    violations.push(
      `dataset taxonomy_version is ${JSON.stringify(dataset.taxonomy_version)}, but data/capabilities.ts is on ${JSON.stringify(TAXONOMY_VERSION)}; update the working copy before publishing`,
    );
  }

  if (violations.length > 0) {
    return { ok: false, written: false, outPath, violations, counts, publishedAt: null };
  }

  const records = recordsOf(dataset);
  await writeJson(outPath, records);
  const publishedAt = nowIso(now);
  const state: PublishedState = {
    out_path: repoRelative(root, outPath),
    published_at: publishedAt,
    // Hash the exact bytes writeJson wrote, so the state can be checked against the file.
    content_hash: sha256(`${JSON.stringify(records, null, 2)}\n`),
    counts,
  };
  await writeJson(paths.published, state);

  return { ok: true, written: true, outPath, violations: [], counts, publishedAt };
}

/** Forward slashes, so the state file reads the same on every platform. */
export function repoRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}
