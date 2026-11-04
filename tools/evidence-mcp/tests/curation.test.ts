/**
 * Curation pipeline tests.
 *
 * `publishCuration` is the only step that turns the agent's working copy into the
 * committed dataset the app renders, so these tests pin the two properties that
 * would silently degrade the dashboard: a record that is not curated (demo data,
 * AGENTS.md rule 10) and a source that never observed its page (no canonical_url,
 * retrieved_at or content_hash). Both are refused, and a refusal writes nothing.
 *
 * Everything runs against a throwaway repository root; no network, no real store.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { TAXONOMY_VERSION } from "../../../data/capabilities";
import type { Dataset, Source } from "../../../lib/types";
import {
  curationPaths,
  curationSummary,
  publishCuration,
  readCuration,
  readPublishedState,
  writeCuration,
} from "../src/curation";
import { sha256 } from "../src/store";

/** A 64-character hex digest: what sha256() of fetched bytes looks like. */
const CONTENT_HASH = "0123456789abcdef".repeat(4);

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: "s-01",
    provenance: "curated",
    created_at: "2026-11-01",
    canonical_url: "https://example.org/paper",
    title: "An observed page",
    publisher: "example.org",
    authors: ["A. Author"],
    published_at: "2026-10-30",
    retrieved_at: "2026-11-01T10:00:00Z",
    source_type: "paper",
    source_tier: "primary",
    developer_affiliated: false,
    content_hash: CONTENT_HASH,
    status: "reviewed",
    ...overrides,
  };
}

/** A minimal dataset lib/validate.ts accepts: one curated source, nothing else. */
function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    label: "curation test records",
    taxonomy_version: TAXONOMY_VERSION,
    sources: [source()],
    claims: [],
    evidence: [],
    capabilities: [],
    assessments: [],
    proposals: [],
    events: [],
    attributions: [],
    forecasts: [],
    questions: [],
    ...overrides,
  };
}

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "curation-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const outPath = () => path.join(root, "data", "curated", "records.json");

async function assertNothingPublished(): Promise<void> {
  await assert.rejects(readFile(outPath(), "utf8"), /ENOENT/);
  assert.equal(await readPublishedState(root), null);
}

test("the working copy round-trips and its summary counts every collection", async () => {
  const written = await writeCuration(root, dataset());
  assert.equal(written, curationPaths(root).records);

  const read = await readCuration(root);
  assert.ok(read);
  assert.equal(read.label, "curation test records");
  assert.deepEqual(curationSummary(read), {
    sources: 1,
    claims: 0,
    evidence: 0,
    capabilities: 0,
    assessments: 0,
    proposals: 0,
    events: 0,
    attributions: 0,
    forecasts: 0,
    questions: 0,
    total: 1,
  });
});

test("publishing without a working copy is refused and writes nothing", async () => {
  assert.equal(await readCuration(root), null);

  const result = await publishCuration({ root });

  assert.equal(result.ok, false);
  assert.equal(result.written, false);
  assert.match(result.violations.join("\n"), /no curation working copy/);
  await assertNothingPublished();
});

test("a demo record is refused: demo fixtures are never published as curated", async () => {
  await writeCuration(
    root,
    dataset({
      sources: [
        source({ provenance: "demo", canonical_url: null, retrieved_at: null, content_hash: null }),
      ],
    }),
  );

  const result = await publishCuration({ root });

  assert.equal(result.ok, false);
  assert.equal(result.written, false);
  assert.match(result.violations.join("\n"), /source s-01: provenance is "demo"/);
  await assertNothingPublished();
});

test("a source with no observed page, hash or retrieval time is refused", async () => {
  await writeCuration(
    root,
    dataset({ sources: [source({ canonical_url: null, retrieved_at: null, content_hash: null })] }),
  );

  const result = await publishCuration({ root });

  assert.equal(result.ok, false);
  const text = result.violations.join("\n");
  assert.match(text, /source s-01: curated records need an observed canonical_url/);
  assert.match(text, /source s-01: curated records need the retrieved_at/);
  assert.match(text, /source s-01: curated records need the content_hash/);
  await assertNothingPublished();
});

test("a dataset pinned to a different taxonomy is refused", async () => {
  await writeCuration(root, dataset({ taxonomy_version: "taxonomy-0" }));

  const result = await publishCuration({ root });

  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /taxonomy_version is "taxonomy-0"/);
  await assertNothingPublished();
});

test("a valid working copy publishes records only, with a trailing newline and a recorded hash", async () => {
  await writeCuration(root, dataset());

  const result = await publishCuration({
    root,
    now: () => new Date("2026-11-04T12:00:00Z"),
  });

  assert.deepEqual(
    { ok: result.ok, written: result.written, violations: result.violations },
    { ok: true, written: true, violations: [] },
  );
  assert.equal(result.counts.sources, 1);
  assert.equal(result.publishedAt, "2026-11-04T12:00:00.000Z");

  const text = await readFile(outPath(), "utf8");
  assert.ok(text.endsWith("\n"), "published JSON must end with a newline");
  const written = JSON.parse(text) as Record<string, unknown>;
  assert.equal("capabilities" in written, false, "capabilities stay in data/capabilities.ts");
  assert.equal(written.taxonomy_version, TAXONOMY_VERSION);
  assert.equal((written.sources as Source[])[0].canonical_url, "https://example.org/paper");

  const state = await readPublishedState(root);
  assert.ok(state);
  assert.equal(state.out_path, "data/curated/records.json");
  assert.equal(state.published_at, "2026-11-04T12:00:00.000Z");
  assert.equal(state.content_hash, sha256(text));
  assert.equal(state.counts.sources, 1);
});

test("a records-only working copy composes the taxonomy before validating", async () => {
  // The committed file has no `capabilities` key, so a working copy copied from it
  // must not report every capability reference as dangling.
  await writeCuration(
    root,
    dataset({
      capabilities: [],
      events: [
        {
          id: "ev-01",
          provenance: "curated",
          created_at: "2026-11-01",
          title: "An observed run",
          occurred_at: "2026-10-30",
          description: "A run that references a taxonomy capability.",
          capability_ids: ["cap-l3"],
          evidence_ids: [],
        },
      ],
    }),
  );

  const result = await publishCuration({ root, now: () => new Date("2026-11-04T12:00:00Z") });

  assert.deepEqual(result.violations, []);
  assert.equal(result.ok, true);

  // And the same copy with a capability id that does not exist is still refused,
  // which is what proves the taxonomy was composed rather than skipped.
  await writeCuration(
    root,
    dataset({
      capabilities: [],
      events: [
        {
          id: "ev-01",
          provenance: "curated",
          created_at: "2026-11-01",
          title: "An observed run",
          occurred_at: "2026-10-30",
          description: "A run that references a capability that does not exist.",
          capability_ids: ["cap-l99"],
          evidence_ids: [],
        },
      ],
    }),
  );

  const refused = await publishCuration({ root });
  assert.equal(refused.ok, false);
  assert.ok(refused.violations.some((v) => v.includes("cap-l99")), refused.violations.join("; "));
});
