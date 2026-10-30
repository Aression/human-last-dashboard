/**
 * Regression tests for the on-disk candidate layout.
 *
 * The discovery run writes one directory per day
 * (`<root>/.evidence-mcp/candidates/<YYYY-MM-DD>/<id>.json`). The quality rules
 * originally listed that directory with a helper that only returns `*.json`
 * names, so every dated subdirectory was invisible: the four candidate rules
 * reported zero subjects while 47 candidates sat on disk. These tests hammer both
 * layouts — dated directories and loose files — because a passing audit must
 * prove it read the records, not that it found nothing to read.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { runQuality } from "../src/quality";
import type { CandidateRecord } from "../src/contracts";

const savedRoot = process.env.EVIDENCE_MCP_ROOT;
let root = "";

function candidate(id: string, createdAt: string): CandidateRecord {
  return {
    id,
    provenance: "discovered",
    created_at: createdAt,
    discovered_by: { run_id: "discovery-test", query_id: "q-self-improvement-repos", adapter: "github" },
    source: {
      canonical_url: `https://example.com/${id}`,
      title: `Example source ${id}`,
      publisher: "example.com",
      authors: [],
      published_at: createdAt.slice(0, 10),
      source_type: "repository",
      source_tier: "lead",
    },
    retrieval: {
      retrieved_at: createdAt,
      http_status: 200,
      content_hash: `hash-${id}`,
      bytes: 128,
      content_type: "text/html",
    },
    status: "new",
    summary: "An example lead kept short so the fixture stays readable.",
    duplicate_of: null,
    triage: null,
    notes: [],
  };
}

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "hld-store-layout-"));
  process.env.EVIDENCE_MCP_ROOT = root;
  const candidates = path.join(root, ".evidence-mcp", "candidates");
  const dated = path.join(candidates, "2026-10-29");
  await mkdir(dated, { recursive: true });
  // 40 days before the audit, so candidate-untriaged is past its 14-day threshold.
  const old = "2026-09-19T00:00:00.000Z";
  await writeFile(path.join(dated, "cand-2026-dated001.json"), JSON.stringify(candidate("cand-2026-dated001", old)), "utf8");
  // The older flat layout must keep working.
  await writeFile(path.join(candidates, "cand-2026-flat0001.json"), JSON.stringify(candidate("cand-2026-flat0001", old)), "utf8");
});

after(async () => {
  if (savedRoot === undefined) delete process.env.EVIDENCE_MCP_ROOT;
  else process.env.EVIDENCE_MCP_ROOT = savedRoot;
  if (root) await rm(root, { recursive: true, force: true });
});

test("candidates stored in dated directories are read, not silently skipped", async () => {
  const outcome = await runQuality({ rules: ["candidate-untriaged"], dryRun: true });
  const check = outcome.checks.find((c) => c.rule === "candidate-untriaged");
  assert.ok(check, "the rule must run");
  assert.equal(check.inspected, 2, "both layouts must be read: dated directory and loose file");
  assert.equal(outcome.findings.length, 2);
  const ids = outcome.findings.map((f) => f.subject.id).sort();
  assert.deepEqual(ids, ["cand-2026-dated001", "cand-2026-flat0001"]);
});
