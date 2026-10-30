/**
 * Quality engine tests.
 *
 * Ground rules for this file:
 *  - `EVIDENCE_MCP_ROOT` points at a throwaway directory, set *before* the engine
 *    (and therefore store/config) is imported, so a test run can never write into
 *    the repository's own `.evidence-mcp/`.
 *  - No test touches the network: every call injects a `fetchImpl` stub, and the
 *    default stub throws, so an unintended request fails the test loudly.
 *  - The engine is given a synthetic dataset and config. lib/demo-data.ts and
 *    tools/evidence-mcp/config/discovery.json stay read-only inputs.
 */
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Pins EVIDENCE_MCP_ROOT to a temp directory; must stay the first local import so
// the engine below can never be pointed at the repository's own .evidence-mcp/.
import { testRoot as tempRoot } from "./support/isolate";

import { QUALITY_RULES, runQuality } from "../src/quality";
import { sha256, storePaths, writeJson } from "../src/store";

import type {
  CandidateRecord,
  QualityCheck,
  QualityFinding,
  Severity,
  ToolConfig,
} from "../src/contracts";
import type { Claim, Dataset, Evidence, Forecast, Source } from "../../../lib/types";

// ------------------------------------------------------------------ fixtures

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function testConfig(quality: Partial<ToolConfig["quality"]> = {}): ToolConfig {
  return {
    version: 1,
    userAgent: "human-last-dashboard-evidence-mcp/0.1 (quality test)",
    request_timeout_ms: 2000,
    max_items_per_query: 5,
    queries: [
      {
        id: "q-test",
        title: "Quality test query",
        intent: "Exist only so the config parses; the quality tests never run discovery.",
        adapters: ["github"],
        keywords: ["test"],
        capability_ids: [],
        limit: 1,
      },
    ],
    schedule: [],
    quality: {
      candidate_max_age_days: 30,
      unreviewed_evidence_days: 120,
      source_recheck_days: 14,
      integrity_batch: 5,
      deny_hosts: ["localhost", "127.0.0.1"],
      ...quality,
    },
  };
}

function emptyDataset(): Dataset {
  return {
    label: "Quality test dataset · synthetic records",
    taxonomy_version: "taxonomy-1",
    sources: [],
    claims: [],
    evidence: [],
    capabilities: [],
    assessments: [],
    proposals: [],
    events: [],
    attributions: [],
    forecasts: [],
    questions: [],
  };
}

function source(over: Partial<Source> & { id: string }): Source {
  return {
    provenance: "curated",
    created_at: "2026-01-01",
    canonical_url: "https://example.test/report",
    title: "Recorded report",
    publisher: "Example Publisher",
    authors: ["Example Author"],
    published_at: "2026-01-01",
    retrieved_at: "2026-01-02",
    source_type: "technical-report",
    source_tier: "primary",
    developer_affiliated: false,
    content_hash: sha256("recorded body"),
    status: "reviewed",
    ...over,
  };
}

function claim(over: Partial<Claim> & { id: string }): Claim {
  return {
    provenance: "demo",
    created_at: "2026-01-01",
    source_id: "s-01",
    statement: "A synthetic statement.",
    claim_type: "observed-fact",
    source_span: "p. 1",
    conditions: "Synthetic conditions.",
    limitations: "Synthetic limitations.",
    extraction_status: "candidate",
    ...over,
  };
}

function evidence(over: Partial<Evidence> & { id: string }): Evidence {
  return {
    provenance: "demo",
    created_at: "2026-01-01",
    source_id: "s-01",
    evidence_type: "direct-result",
    polarity: "supports",
    observation: "Synthetic observation.",
    method: "Synthetic method.",
    limitations: "Synthetic limitations.",
    reproducibility_notes: "Synthetic notes.",
    review_status: "accepted",
    claim_ids: ["c-01"],
    capability_ids: [],
    ...over,
  };
}

function forecast(over: Partial<Forecast> & { id: string }): Forecast {
  return {
    provenance: "demo",
    created_at: "2026-01-01",
    statement: "A synthetic forecast statement.",
    resolution_date: "2026-12-31",
    resolution_criteria: "Synthetic criteria.",
    probability: 0.5,
    rationale: "Synthetic rationale.",
    evidence_ids: [],
    status: "open",
    resolution_notes: null,
    resolved_at: null,
    ...over,
  };
}

function candidate(over: Partial<CandidateRecord> & { id: string }): CandidateRecord {
  return {
    provenance: "discovered",
    created_at: new Date().toISOString(),
    discovered_by: { run_id: "run-1", query_id: "q-test", adapter: "github" },
    source: {
      canonical_url: "https://example.test/candidate",
      title: "Synthetic candidate",
      publisher: "Example Publisher",
      authors: ["Example Author"],
      published_at: null,
      source_type: "repository",
      source_tier: "lead",
    },
    retrieval: {
      retrieved_at: null,
      http_status: 200,
      content_hash: null,
      bytes: null,
      content_type: null,
    },
    status: "new",
    summary: "Synthetic adapter summary.",
    duplicate_of: null,
    triage: null,
    notes: [],
    ...over,
  };
}

const noNetwork: typeof fetch = async () => {
  throw new Error("network disabled in quality tests");
};

async function resetCandidates(): Promise<void> {
  rmSync(storePaths(tempRoot).candidates, { recursive: true, force: true });
}

async function seedCandidates(records: CandidateRecord[]): Promise<void> {
  await resetCandidates();
  for (const record of records) {
    await writeJson(path.join(storePaths(tempRoot).candidates, `${record.id}.json`), record);
  }
}

async function audit(
  rules: string[],
  dataset: Dataset,
  extra: { config?: ToolConfig; fetchImpl?: typeof fetch } = {},
) {
  return runQuality({
    rules,
    dataset,
    config: extra.config ?? testConfig(),
    fetchImpl: extra.fetchImpl ?? noNetwork,
    dryRun: true,
  });
}

function findingsFor(outcome: { findings: QualityFinding[] }, rule: string): QualityFinding[] {
  return outcome.findings.filter((finding) => finding.rule === rule);
}

function checkFor(
  outcome: { checks: QualityCheck[] },
  rule: string,
): QualityCheck | undefined {
  return outcome.checks.find((check) => check.rule === rule);
}

// --------------------------------------------------------------------- rules

test("QUALITY_RULES lists every rule the engine runs", () => {
  assert.deepEqual(QUALITY_RULES, [
    "dataset-valid",
    "dataset-selectors",
    "candidate-stale",
    "candidate-untriaged",
    "candidate-suspect-url",
    "candidate-duplicate-hash",
    "evidence-unreviewed",
    "forecast-overdue",
    "source-integrity",
    "provenance-gaps",
  ]);
});

test("dataset-valid reports one error finding per violation and passes a clean dataset", async () => {
  const clean = await audit(["dataset-valid"], emptyDataset());
  assert.equal(clean.findings.length, 0);
  assert.equal(checkFor(clean, "dataset-valid")?.ok, true);

  const broken = emptyDataset();
  broken.sources = [source({ id: "s-01" }), source({ id: "s-01" })];

  const first = await audit(["dataset-valid"], broken);
  assert.ok(first.findings.length >= 1, "expected at least one violation");
  for (const finding of first.findings) {
    assert.equal(finding.rule, "dataset-valid");
    assert.equal(finding.severity, "error");
    assert.equal(finding.subject.kind, "dataset");
    assert.equal(finding.auto_fixable, false);
  }
  assert.ok(
    first.findings.some((finding) => finding.detail.includes("duplicate id")),
    `expected a duplicate-id violation, got: ${first.findings.map((f) => f.detail).join(" | ")}`,
  );

  // Ids are derived from rule + subject + detail, so a repeat run is byte-stable.
  const second = await audit(["dataset-valid"], broken);
  assert.deepEqual(
    second.findings.map((f) => f.id),
    first.findings.map((f) => f.id),
  );
});

test("dataset-selectors turns a dangling reference into an error finding", async () => {
  const broken = emptyDataset();
  broken.claims = [claim({ id: "c-01", source_id: "s-missing" })];

  const outcome = await audit(["dataset-selectors"], broken);
  assert.equal(outcome.findings.length, 1);
  const finding = outcome.findings[0];
  assert.equal(finding.rule, "dataset-selectors");
  assert.equal(finding.severity, "error");
  assert.match(finding.detail, /Dangling source reference: s-missing/);
  assert.equal(checkFor(outcome, "dataset-selectors")?.ok, true);

  const clean = emptyDataset();
  clean.sources = [source({ id: "s-01" })];
  clean.claims = [claim({ id: "c-01", source_id: "s-01" })];
  const cleanOutcome = await audit(["dataset-selectors"], clean);
  assert.equal(cleanOutcome.findings.length, 0);
});

test("candidate-stale flags only old, untouched candidates and is auto-fixable", async () => {
  await seedCandidates([
    candidate({ id: "cand-old", created_at: daysAgo(100) }),
    candidate({ id: "cand-fresh", created_at: daysAgo(1) }),
    candidate({ id: "cand-triaged", created_at: daysAgo(100), status: "triaged-review" }),
  ]);

  const outcome = await audit(["candidate-stale"], emptyDataset());
  const findings = findingsFor(outcome, "candidate-stale");
  assert.equal(findings.length, 1, JSON.stringify(findings, null, 2));
  assert.equal(findings[0].subject.kind, "candidate");
  assert.equal(findings[0].subject.id, "cand-old");
  assert.equal(findings[0].severity, "warn");
  assert.equal(findings[0].auto_fixable, true);
  assert.match(findings[0].remediation, /archive after review/);
  await resetCandidates();
});

test("candidate-untriaged flags candidates older than 14 days with no triage", async () => {
  await seedCandidates([
    candidate({ id: "cand-old", created_at: daysAgo(40) }),
    candidate({ id: "cand-fresh", created_at: daysAgo(2) }),
    candidate({
      id: "cand-triaged",
      created_at: daysAgo(40),
      triage: { decision: "reject", reason: "off topic", at: daysAgo(30) },
    }),
  ]);

  const findings = findingsFor(await audit(["candidate-untriaged"], emptyDataset()), "candidate-untriaged");
  assert.equal(findings.length, 1, JSON.stringify(findings, null, 2));
  assert.equal(findings[0].subject.id, "cand-old");
  assert.equal(findings[0].severity, "info");
  assert.equal(findings[0].auto_fixable, false);
  await resetCandidates();
});

test("candidate-suspect-url flags private and non-http(s) candidate URLs", async () => {
  const loopback = {
    ...candidate({ id: "cand-loopback" }).source,
    canonical_url: "http://127.0.0.1:8080/candidate",
  };
  const fileUrl = {
    ...candidate({ id: "cand-file" }).source,
    canonical_url: "file:///etc/passwd",
  };
  await seedCandidates([
    candidate({ id: "cand-loopback", source: loopback }),
    candidate({ id: "cand-file", source: fileUrl }),
    candidate({ id: "cand-public" }),
  ]);

  const findings = findingsFor(await audit(["candidate-suspect-url"], emptyDataset()), "candidate-suspect-url");
  assert.equal(findings.length, 2, JSON.stringify(findings, null, 2));
  assert.deepEqual(findings.map((f) => f.subject.id).sort(), ["cand-file", "cand-loopback"]);
  for (const finding of findings) {
    assert.equal(finding.severity, "error");
    assert.equal(finding.auto_fixable, false);
  }
  await resetCandidates();

  // The private host must never be handed to fetch, even by the integrity rule.
  await seedCandidates([candidate({ id: "cand-loopback", source: loopback })]);
  let fetched = 0;
  const outcome = await audit(["candidate-suspect-url"], emptyDataset(), {
    fetchImpl: async () => {
      fetched += 1;
      return new Response(null, { status: 200 });
    },
  });
  assert.equal(fetched, 0);
  assert.equal(findingsFor(outcome, "candidate-suspect-url").length, 1);
  await resetCandidates();
});

test("candidate-duplicate-hash warns on shared content and stops once one is marked", async () => {
  const hash = sha256("shared page body");
  await seedCandidates([
    candidate({
      id: "cand-a",
      retrieval: { retrieved_at: null, http_status: 200, content_hash: hash, bytes: 16, content_type: "text/html" },
    }),
    candidate({
      id: "cand-b",
      retrieval: { retrieved_at: null, http_status: 200, content_hash: hash, bytes: 16, content_type: "text/html" },
    }),
    candidate({ id: "cand-solo" }),
  ]);

  const findings = findingsFor(await audit(["candidate-duplicate-hash"], emptyDataset()), "candidate-duplicate-hash");
  assert.equal(findings.length, 1, JSON.stringify(findings, null, 2));
  assert.equal(findings[0].severity, "warn");
  assert.equal(findings[0].auto_fixable, true);
  assert.match(findings[0].detail, /cand-a, cand-b/);

  await seedCandidates([
    candidate({
      id: "cand-a",
      retrieval: { retrieved_at: null, http_status: 200, content_hash: hash, bytes: 16, content_type: "text/html" },
    }),
    candidate({
      id: "cand-b",
      status: "duplicate",
      duplicate_of: "cand-a",
      retrieval: { retrieved_at: null, http_status: 200, content_hash: hash, bytes: 16, content_type: "text/html" },
    }),
  ]);
  const marked = await audit(["candidate-duplicate-hash"], emptyDataset());
  assert.equal(marked.findings.length, 0);
  await resetCandidates();
});

test("evidence-unreviewed only flags old unreviewed demo evidence and says it is demo data", async () => {
  const ds = emptyDataset();
  ds.sources = [source({ id: "s-01" })];
  ds.claims = [claim({ id: "c-01" })];
  ds.evidence = [
    evidence({ id: "e-old", created_at: daysAgo(200), review_status: "unreviewed" }),
    evidence({ id: "e-fresh", created_at: daysAgo(2), review_status: "unreviewed" }),
    evidence({ id: "e-reviewed", created_at: daysAgo(200), review_status: "accepted" }),
    evidence({ id: "e-curated", created_at: daysAgo(200), review_status: "unreviewed", provenance: "curated" }),
  ];

  const outcome = await audit(["evidence-unreviewed"], ds);
  const findings = findingsFor(outcome, "evidence-unreviewed");
  assert.equal(findings.length, 1, JSON.stringify(findings, null, 2));
  assert.equal(findings[0].subject.kind, "evidence");
  assert.equal(findings[0].subject.id, "e-old");
  assert.equal(findings[0].severity, "warn");
  assert.match(findings[0].detail, /fictional demo data/);
});

test("forecast-overdue flags open forecasts past their date, capped at two", async () => {
  const ds = emptyDataset();
  ds.forecasts = [
    forecast({ id: "f-01", resolution_date: "2020-01-01" }),
    forecast({ id: "f-02", resolution_date: "2021-01-01" }),
    forecast({ id: "f-03", resolution_date: "2022-01-01" }),
    forecast({ id: "f-future", resolution_date: "2099-01-01" }),
    forecast({
      id: "f-resolved",
      resolution_date: "2020-01-01",
      status: "resolved-true",
      resolved_at: "2020-01-02",
      resolution_notes: "Resolved on time.",
    }),
  ];

  const outcome = await audit(["forecast-overdue"], ds);
  const findings = findingsFor(outcome, "forecast-overdue");
  assert.equal(findings.length, 2, JSON.stringify(findings, null, 2));
  assert.deepEqual(findings.map((f) => f.subject.id), ["f-01", "f-02"]);
  for (const finding of findings) {
    assert.equal(finding.severity, "warn");
    assert.equal(finding.auto_fixable, false);
    assert.match(finding.detail, /resolution_date .* is in the past/);
  }
});

test("source-integrity flags non-2xx, hash mismatch, and skips unfetchable URLs", async () => {
  const ds = emptyDataset();
  ds.sources = [
    source({ id: "s-gone", canonical_url: "https://example.test/gone", content_hash: null }),
    source({ id: "s-private", canonical_url: "http://127.0.0.1:9/secret" }),
    source({ id: "s-moved", canonical_url: "https://example.test/moved" }),
  ];

  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("/gone")) return new Response(null, { status: 404 });
    return new Response("rewritten body", { status: 200 });
  };

  const outcome = await audit(["source-integrity"], ds, { fetchImpl });
  const findings = findingsFor(outcome, "source-integrity");

  assert.deepEqual(seen.sort(), ["https://example.test/gone", "https://example.test/moved"]);
  assert.equal(checkFor(outcome, "source-integrity")?.ok, true);

  const gone = findings.find((f) => f.subject.id === "s-gone");
  assert.ok(gone, JSON.stringify(findings, null, 2));
  assert.equal(gone.severity, "warn");
  assert.match(gone.detail, /HTTP 404/);

  const moved = findings.find((f) => f.subject.id === "s-moved");
  assert.ok(moved, JSON.stringify(findings, null, 2));
  assert.equal(moved.severity, "error");
  assert.match(moved.detail, /content_hash/);

  // A matching body must produce no finding at all.
  const matching = emptyDataset();
  matching.sources = [
    source({ id: "s-ok", canonical_url: "https://example.test/ok", content_hash: sha256("stable body") }),
  ];
  const clean = await audit(["source-integrity"], matching, {
    fetchImpl: async () => new Response("stable body", { status: 200 }),
  });
  assert.equal(clean.findings.length, 0);
  assert.equal(checkFor(clean, "source-integrity")?.ok, true);
});

test("source-integrity surfaces a network failure on the check instead of passing", async () => {
  const ds = emptyDataset();
  ds.sources = [source({ id: "s-down", canonical_url: "https://example.test/down", content_hash: null })];

  const outcome = await audit(["source-integrity"], ds, {
    fetchImpl: async () => {
      throw new Error("getaddrinfo ENOTFOUND example.test");
    },
  });

  const check = checkFor(outcome, "source-integrity");
  assert.ok(check);
  assert.equal(check.ok, false);
  assert.match(check.error ?? "", /could not fetch https:\/\/example\.test\/down/);
  assert.match(check.error ?? "", /ENOTFOUND/);
  assert.equal(outcome.findings.length, 0);
});

test("provenance-gaps flags curated sources without retrieval provenance", async () => {
  const ds = emptyDataset();
  ds.sources = [
    source({ id: "s-gap", retrieved_at: null }),
    source({ id: "s-ok", content_hash: sha256("body") }),
  ];
  ds.claims = [claim({ id: "c-01", source_id: "s-ok" })];
  ds.evidence = [
    evidence({ id: "e-ok", source_id: "s-ok", claim_ids: ["c-01"] }),
    evidence({ id: "e-orphan", source_id: "s-absent", claim_ids: [] }),
  ];

  const findings = findingsFor(await audit(["provenance-gaps"], ds), "provenance-gaps");
  const subjects = findings.map((f) => `${f.subject.kind}:${f.subject.id}`).sort();
  assert.deepEqual(subjects, ["evidence:e-orphan", "source:s-gap"]);
  for (const finding of findings) {
    assert.equal(finding.severity, "warn");
    assert.equal(finding.auto_fixable, false);
  }
});

// ------------------------------------------------------------------ failure

test("a rule that throws is reported in checks[].error, not swallowed", async () => {
  const broken = emptyDataset() as unknown as Dataset;
  (broken as { evidence: unknown }).evidence = null;

  const outcome = await audit(["provenance-gaps"], broken);
  const check = checkFor(outcome, "provenance-gaps");
  assert.ok(check);
  assert.equal(check.ok, false);
  assert.equal(outcome.findings.length, 0);
  assert.match(check.error ?? "", /Cannot read properties of null/);
});

// -------------------------------------------------------------- runQuality I/O

test("runQuality persists the outcome and a run record, and writes only inside .evidence-mcp", async () => {
  const outcome = await runQuality({
    config: testConfig(),
    dataset: emptyDataset(),
    fetchImpl: noNetwork,
  });

  const store = storePaths(tempRoot);
  assert.equal(store.root, tempRoot);

  const saved = JSON.parse(readFileSync(path.join(store.quality, `${outcome.run_id}.json`), "utf8"));
  assert.equal(saved.run_id, outcome.run_id);
  assert.deepEqual(saved.checks, outcome.checks);

  const index = readFileSync(path.join(store.runs, "index.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { run_id: string; task: string; ok: boolean; summary: string });
  const record = index.find((entry) => entry.run_id === outcome.run_id);
  assert.ok(record, "run record missing from runs/index.jsonl");
  assert.equal(record.task, "quality");
  assert.equal(record.ok, true);
  assert.match(record.summary, new RegExp(outcome.run_id));

  // Nothing may be written outside the tool's own store directory.
  const written = walk(tempRoot).filter((file) => !file.includes(`${path.sep}state${path.sep}`));
  for (const file of written) {
    assert.ok(
      file.startsWith(path.join(tempRoot, ".evidence-mcp")),
      `quality run wrote outside .evidence-mcp: ${file}`,
    );
  }
});

test("dryRun computes the outcome but writes neither the run file nor the index line", async () => {
  const store = storePaths(tempRoot);
  const before = readdirSync(store.quality).length;
  const indexBefore = readFileSync(path.join(store.runs, "index.jsonl"), "utf8").split("\n").filter(Boolean).length;

  const outcome = await runQuality({
    config: testConfig(),
    dataset: emptyDataset(),
    fetchImpl: noNetwork,
    dryRun: true,
  });

  assert.equal(outcome.findings.length, 0);
  assert.equal(outcome.checks.length, QUALITY_RULES.length);
  assert.equal(readdirSync(store.quality).length, before);
  const indexAfter = readFileSync(path.join(store.runs, "index.jsonl"), "utf8").split("\n").filter(Boolean).length;
  assert.equal(indexAfter, indexBefore);
});

test("rule selection restricts the run and an unknown rule id fails loudly", async () => {
  const outcome = await audit(["dataset-valid", "dataset-selectors"], emptyDataset());
  assert.deepEqual(
    outcome.checks.map((check) => check.rule),
    ["dataset-valid", "dataset-selectors"],
  );

  await assert.rejects(
    () => audit(["dataset-valid", "not-a-rule"], emptyDataset()),
    /unknown quality rule\(s\): not-a-rule/,
  );
});

test("the repository's demo dataset passes the dataset rules (no invented findings)", async () => {
  // No dataset override: this is lib/demo-data.ts, the records the dashboard shows.
  const outcome = await runQuality({
    rules: ["dataset-valid", "dataset-selectors", "provenance-gaps"],
    config: testConfig(),
    fetchImpl: noNetwork,
    dryRun: true,
  });

  assert.deepEqual(
    outcome.findings.map((finding) => `${finding.rule}: ${finding.detail}`),
    [],
  );
  assert.equal(outcome.counts.total, 0);
  for (const check of outcome.checks) assert.equal(check.ok, true, check.error);
});

test("findings are sorted by severity, then id", async () => {
  const ds = emptyDataset();
  ds.sources = [source({ id: "s-01" }), source({ id: "s-01" })];
  ds.claims = [claim({ id: "c-01", source_id: "s-missing" })];
  ds.forecasts = [forecast({ id: "f-01", resolution_date: "2020-01-01" })];

  const outcome = await audit(
    ["dataset-valid", "dataset-selectors", "forecast-overdue"],
    ds,
  );
  const rank: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  for (let i = 1; i < outcome.findings.length; i += 1) {
    const previous = outcome.findings[i - 1];
    const current = outcome.findings[i];
    const order = rank[previous.severity] - rank[current.severity];
    assert.ok(
      order < 0 || (order === 0 && previous.id <= current.id),
      `findings not sorted: ${previous.severity}/${previous.id} then ${current.severity}/${current.id}`,
    );
  }
  assert.equal(outcome.counts.total, outcome.findings.length);
  assert.equal(
    outcome.counts.error + outcome.counts.warn + outcome.counts.info,
    outcome.counts.total,
  );
});

test("a check over an empty subject set reports inspected 0 instead of a silent pass", async () => {
  await resetCandidates();
  const outcome = await audit(QUALITY_RULES, emptyDataset());

  // Collected with no datasets, no candidates, no sources/fetches: every rule
  // that looks at records evaluated nothing. `ok: true, inspected: 0` is the
  // shape the report renders as "skipped" — never as a pass.
  for (const rule of [
    "dataset-valid",
    "candidate-stale",
    "candidate-untriaged",
    "candidate-suspect-url",
    "candidate-duplicate-hash",
    "evidence-unreviewed",
    "forecast-overdue",
    "source-integrity",
    "provenance-gaps",
  ]) {
    const check = checkFor(outcome, rule);
    assert.ok(check, `missing check for ${rule}`);
    assert.equal(check.ok, true, `${rule} should not fail`);
    assert.equal(check.inspected, 0, `${rule} inspected nothing, so it must say 0`);
  }
  // Selectors are the exception: they exercise their probe contracts against any
  // dataset, so the count is the number of probes, not zero.
  assert.equal(checkFor(outcome, "dataset-selectors")?.inspected, 5);
});

test("inspected counts the records each rule actually evaluated", async () => {
  await resetCandidates();
  const ds = emptyDataset();
  ds.sources = [
    source({ id: "s-01", canonical_url: "https://example.test/a", content_hash: null }),
    source({ id: "s-02", canonical_url: "https://example.test/b", content_hash: null }),
  ];
  ds.claims = [claim({ id: "c-01", source_id: "s-01" })];
  ds.evidence = [evidence({ id: "e-01", source_id: "s-01", claim_ids: ["c-01"] })];
  ds.forecasts = [
    forecast({ id: "f-open", status: "open", resolution_date: "2099-01-01" }),
    forecast({ id: "f-done", status: "resolved-true" }),
  ];

  const outcome = await audit(
    [
      "dataset-valid",
      "evidence-unreviewed",
      "forecast-overdue",
      "source-integrity",
      "provenance-gaps",
    ],
    ds,
    { fetchImpl: async () => new Response(null, { status: 200 }) },
  );

  // dataset-valid: every record in every array (2 + 1 + 1 + 2 = 6).
  assert.equal(checkFor(outcome, "dataset-valid")?.inspected, 6);
  assert.equal(checkFor(outcome, "evidence-unreviewed")?.inspected, 1);
  // Only open forecasts are subjects; the resolved one is not re-checked.
  assert.equal(checkFor(outcome, "forecast-overdue")?.inspected, 1);
  // Both sources carry a fetchable URL, so both were probed.
  assert.equal(checkFor(outcome, "source-integrity")?.inspected, 2);
  assert.equal(checkFor(outcome, "provenance-gaps")?.inspected, 3); // 2 sources + 1 evidence

  // The cap is what "inspected" is measured against: a limit of 1 inspects one.
  const capped = await runQuality({
    rules: ["provenance-gaps"],
    dataset: ds,
    config: testConfig(),
    fetchImpl: noNetwork,
    limit: 1,
    dryRun: true,
  });
  assert.equal(checkFor(capped, "provenance-gaps")?.inspected, 2); // 1 source + 1 evidence
});

test("a failed check never reports subjects it did not reach", async () => {
  const ds = emptyDataset();
  ds.sources = [
    source({ id: "s-down", canonical_url: "https://example.test/down", content_hash: null }),
  ];

  const outcome = await audit(["source-integrity"], ds, {
    fetchImpl: async () => {
      throw new Error("getaddrinfo ENOTFOUND example.test");
    },
  });

  const check = checkFor(outcome, "source-integrity");
  assert.ok(check);
  assert.equal(check.ok, false);
  assert.equal(check.inspected, 0, "the probe never completed, so nothing was inspected");
  assert.match(check.error ?? "", /ENOTFOUND/);
});

test("cleanup: the suite leaves no lock or temp artefacts inside the repository", async () => {
  // The lock file is released after every run; a leftover lock would block the daemon.
  rmSync(path.join(tempRoot, ".evidence-mcp", "state", "quality.lock"), { force: true });
  const lockPath = path.join(tempRoot, ".evidence-mcp", "state", "quality.lock");
  mkdirSync(path.dirname(lockPath), { recursive: true });
  writeFileSync(path.join(tempRoot, ".evidence-mcp", "state", "probe.txt"), "probe\n");

  const outcome = await runQuality({
    rules: ["dataset-valid"],
    config: testConfig(),
    dataset: emptyDataset(),
    fetchImpl: noNetwork,
    dryRun: true,
  });
  assert.equal(outcome.checks[0].ok, true);
  assert.equal(
    readdirSync(path.dirname(lockPath)).includes("quality.lock"),
    false,
    "quality.lock was left behind",
  );
});

// ------------------------------------------------------------------- helpers

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
