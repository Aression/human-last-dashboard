/**
 * Discovery tests: candidate construction, provenance, dedupe, dry runs.
 *
 * Every test points `EVIDENCE_MCP_ROOT` and `EVIDENCE_MCP_CONFIG` at a fresh
 * temporary directory before importing the module under test, and injects a fake
 * `fetchImpl`, so no test touches the network or the repository's real store.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";

import type { CandidateRecord, DiscoveryOutcome } from "../src/contracts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

let discovery: typeof import("../src/discovery");
let store: typeof import("../src/store");

process.env.EVIDENCE_MCP_ROOT = mkdtempSync(path.join(tmpdir(), "evidence-mcp-discovery-boot-"));

before(async () => {
  discovery = await import("../src/discovery");
  store = await import("../src/store");
});

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

interface FakeReply {
  status: number;
  body: string;
  contentType?: string;
}

function fakeFetch(handler: (url: URL) => FakeReply | null): {
  impl: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const impl = (async (input: unknown) => {
    const raw =
      typeof input === "string" ? input : String((input as { url?: string } | null)?.url ?? input);
    calls.push(raw);
    const reply = handler(new URL(raw));
    if (!reply) throw new TypeError(`unexpected request in test: ${raw}`);
    return new Response(reply.body, {
      status: reply.status,
      headers: { "content-type": reply.contentType ?? "text/html; charset=utf-8" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** A page whose bytes differ per URL, so hash-based dedupe is not triggered by accident. */
function pageFor(url: string): string {
  return fixture("page-article.html").replace(
    "</main>",
    `  <p data-url="${url}">retrieved stub body</p>\n    </main>`,
  );
}

const ARXIV_FEED = fixture("arxiv-atom.xml");
const RSS_FEED = fixture("rss-feed.xml");
const ATOM_FEED = fixture("atom-feed.xml");

function baseQueries(): unknown[] {
  return [
    {
      id: "q-papers",
      title: "Papers on self-improvement",
      intent: "Find preprints about automated improvement loops for review.",
      adapters: ["arxiv"],
      keywords: ["recursive self-improvement"],
      capability_ids: ["cap-l2"],
      limit: 2,
    },
    {
      id: "q-feeds",
      title: "Feed commentary",
      intent: "Find commentary in configured feeds; commentary never counts as evidence.",
      adapters: ["rss"],
      keywords: ["capability evaluation"],
      capability_ids: [],
      limit: 3,
      feeds: ["https://example.org/rss-feed.xml", "https://example.net/atom-feed.xml"],
    },
  ];
}

function writeConfig(root: string, queries: unknown[]): string {
  const configPath = path.join(root, "discovery.json");
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        version: 1,
        userAgent: "human-last-dashboard-evidence-mcp-test/0.1 (+test run; not a deployment)",
        request_timeout_ms: 20000,
        max_items_per_query: 10,
        queries,
        schedule: [],
        quality: {
          candidate_max_age_days: 30,
          unreviewed_evidence_days: 120,
          source_recheck_days: 14,
          integrity_batch: 5,
          deny_hosts: [
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "169.254.169.254",
            "metadata.google.internal",
          ],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return configPath;
}

/** Fresh isolated store + config for one test. */
function freshStore(label: string, queries: unknown[] = baseQueries()): string {
  const root = mkdtempSync(path.join(tmpdir(), `evidence-mcp-${label}-`));
  const configPath = writeConfig(root, queries);
  process.env.EVIDENCE_MCP_ROOT = root;
  process.env.EVIDENCE_MCP_CONFIG = configPath;
  return root;
}

function defaultHandler(url: URL): FakeReply | null {
  if (url.hostname === "export.arxiv.org") {
    return { status: 200, body: ARXIV_FEED, contentType: "application/atom+xml" };
  }
  if (url.hostname === "example.org" && url.pathname === "/rss-feed.xml") {
    return { status: 200, body: RSS_FEED, contentType: "application/rss+xml" };
  }
  if (url.hostname === "example.net" && url.pathname === "/atom-feed.xml") {
    return { status: 200, body: ATOM_FEED, contentType: "application/atom+xml" };
  }
  // Item pages: any URL the adapters produced is served from the HTML fixture.
  if (url.hostname === "arxiv.org" || url.hostname === "example.org" || url.hostname === "example.net") {
    return { status: 200, body: pageFor(url.href), contentType: "text/html; charset=utf-8" };
  }
  return null;
}

function candidateFiles(root: string): string[] {
  const dir = path.join(root, ".evidence-mcp", "candidates");
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of readdirSync(path.join(dir, entry.name))) {
      if (name.endsWith(".json")) files.push(path.join(dir, entry.name, name));
    }
  }
  return files.sort();
}

function jsonlLines(root: string): unknown[] {
  const file = path.join(root, ".evidence-mcp", "runs", "candidates.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

test("discovery builds lead candidates with provenance and a real retrieval hash", async () => {
  const root = freshStore("main");
  const { impl, calls } = fakeFetch(defaultHandler);

  const outcome = await discovery.runDiscovery({ fetchImpl: impl });

  assert.equal(outcome.dry_run, false);
  assert.equal(outcome.queries.length, 2);
  assert.equal(outcome.run_id.startsWith("discovery-"), true);

  const papers = outcome.queries.find((q) => q.query_id === "q-papers");
  const feeds = outcome.queries.find((q) => q.query_id === "q-feeds");
  assert.ok(papers && feeds);
  assert.equal(papers.candidates.length, 2);
  assert.equal(feeds.candidates.length, 3, "the rss adapter is capped by the query limit");

  const first = papers.candidates[0];
  assert.match(first.id, /^cand-\d{4}-[0-9a-f]{8}$/);
  assert.equal(first.id, store.candidateId(store.normalizeUrl("https://arxiv.org/abs/2401.01234")));
  assert.equal(first.provenance, "discovered");
  assert.deepEqual(first.discovered_by, {
    run_id: outcome.run_id,
    query_id: "q-papers",
    adapter: "arxiv",
  });
  assert.equal(first.source.canonical_url, "https://arxiv.org/abs/2401.01234");
  assert.equal(first.source.source_tier, "lead");
  assert.equal(first.source.source_type, "paper");
  assert.equal(first.source.publisher, "arXiv");
  assert.equal(first.source.published_at, "2024-01-03");
  assert.deepEqual(first.source.authors, ["Ada Lovelace", "Grace Hopper"]);
  assert.equal(first.status, "new");
  assert.equal(first.duplicate_of, null);
  assert.equal(first.triage, null);
  assert.deepEqual(first.notes, []);

  const page = pageFor("https://arxiv.org/abs/2401.01234");
  assert.equal(first.retrieval.http_status, 200);
  assert.ok(first.retrieval.retrieved_at !== null);
  assert.equal(first.retrieval.content_hash, store.sha256(new Uint8Array(Buffer.from(page, "utf8"))));
  assert.equal(first.retrieval.bytes, Buffer.byteLength(page, "utf8"));
  assert.equal(first.retrieval.content_type, "text/html; charset=utf-8");

  // Source types are guessed from the item's own title, and stay coarse.
  assert.deepEqual(
    feeds.candidates.map((candidate) => candidate.source.source_type),
    ["benchmark", "announcement", "report"],
  );
  assert.equal(feeds.candidates[0].source.publisher, "Alignment Lab Notes");

  // Totals account for everything the run did.
  assert.deepEqual(outcome.totals, {
    candidates: 5,
    duplicates: 0,
    skipped_existing: 0,
    adapter_failures: 0,
    requests: 3,
  });

  // Persistence: one file per candidate, an index line per candidate, one run file.
  const files = candidateFiles(root);
  assert.equal(files.length, 5);
  const reloaded = JSON.parse(readFileSync(files[0], "utf8")) as CandidateRecord;
  assert.ok(outcome.queries.flatMap((q) => q.candidates).some((c) => c.id === reloaded.id));
  assert.equal(jsonlLines(root).length, 5);
  const runFile = path.join(root, ".evidence-mcp", "runs", "discovery", `${outcome.run_id}.json`);
  assert.equal(existsSync(runFile), true);
  assert.deepEqual(JSON.parse(readFileSync(runFile, "utf8")), outcome);

  // The lock is released and every request was one the run should have made.
  assert.equal(existsSync(path.join(root, ".evidence-mcp", "state", "discovery.lock")), false);
  assert.equal(calls.length, 5 + 3, "3 adapter requests + 5 page retrievals");

  // Unrelated state stays untouched.
  assert.equal(existsSync(path.join(root, ".evidence-mcp", "quality")), true);
});

test("a second run counts stored candidates instead of rewriting them", async () => {
  const root = freshStore("rerun");
  const { impl } = fakeFetch(defaultHandler);

  const first = await discovery.runDiscovery({ fetchImpl: impl });
  const filesAfterFirst = candidateFiles(root);
  const outcomeAfterFirst = readFileSync(
    path.join(root, ".evidence-mcp", "runs", "discovery", `${first.run_id}.json`),
    "utf8",
  );

  const second = await discovery.runDiscovery({ fetchImpl: impl });

  assert.equal(second.run_id !== first.run_id, true);
  assert.deepEqual(second.totals, {
    candidates: 0,
    duplicates: 0,
    skipped_existing: 5,
    adapter_failures: 0,
    requests: 3,
  });
  assert.deepEqual(second.queries.map((q) => q.skipped_existing), [2, 3]);
  assert.deepEqual(
    second.queries.flatMap((q) => q.candidates),
    [],
    "an already-stored lead is not re-recorded",
  );
  assert.deepEqual(candidateFiles(root), filesAfterFirst);
  assert.equal(jsonlLines(root).length, 5, "no new index lines for skipped items");
  // The earlier run's outcome file was not rewritten either.
  assert.equal(
    readFileSync(path.join(root, ".evidence-mcp", "runs", "discovery", `${first.run_id}.json`), "utf8"),
    outcomeAfterFirst,
  );
});

test("identical content under a different URL is stored once as a duplicate", async () => {
  freshStore("hash-dup");
  const sharedBody = "<html><body><p>identical release notes</p></body></html>";
  const { impl } = fakeFetch((url) => {
    if (url.hostname === "example.org" && url.pathname === "/rss-feed.xml") {
      return { status: 200, body: RSS_FEED, contentType: "application/rss+xml" };
    }
    if (url.hostname === "example.net" && url.pathname === "/atom-feed.xml") {
      return { status: 200, body: ATOM_FEED, contentType: "application/atom+xml" };
    }
    return { status: 200, body: sharedBody, contentType: "text/html" };
  });

  const outcome = await discovery.runDiscovery({ fetchImpl: impl, queryIds: ["q-feeds"] });
  const candidates = outcome.queries[0].candidates;

  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].status, "new");
  assert.equal(candidates[0].duplicate_of, null);
  assert.equal(candidates[1].status, "duplicate");
  assert.equal(candidates[1].duplicate_of, candidates[0].id);
  assert.equal(candidates[2].status, "duplicate");
  assert.equal(candidates[2].duplicate_of, candidates[0].id);
  assert.match(candidates[1].notes.join(" "), /same content_hash as/);
  // The duplicate still records the GET it really performed.
  assert.equal(candidates[1].retrieval.content_hash, candidates[0].retrieval.content_hash);
  assert.equal(outcome.totals.duplicates, 2);
  assert.equal(outcome.totals.candidates, 3);
});

test("dry run builds candidates and writes nothing at all", async () => {
  const root = freshStore("dry");
  const { impl } = fakeFetch(defaultHandler);

  const outcome = await discovery.runDiscovery({ fetchImpl: impl, dryRun: true });

  assert.equal(outcome.dry_run, true);
  assert.equal(outcome.totals.candidates, 5);
  assert.equal(existsSync(path.join(root, ".evidence-mcp")), false);
});

test("adapter failure is counted, recorded, and contributes no candidate", async () => {
  const root = freshStore("failure");
  const { impl } = fakeFetch((url) => {
    if (url.hostname === "export.arxiv.org") return { status: 500, body: "boom" };
    return defaultHandler(url);
  });

  const outcome = await discovery.runDiscovery({ fetchImpl: impl });
  const papers = outcome.queries.find((q) => q.query_id === "q-papers");
  const feeds = outcome.queries.find((q) => q.query_id === "q-feeds");

  assert.ok(papers && feeds);
  assert.equal(papers.adapters.length, 1);
  assert.equal(papers.adapters[0].ok, false);
  assert.match(papers.adapters[0].error ?? "", /500/);
  assert.deepEqual(papers.candidates, []);
  assert.equal(feeds.candidates.length, 3);
  assert.equal(outcome.totals.adapter_failures, 1);
  assert.equal(outcome.totals.candidates, 3);
  assert.equal(candidateFiles(root).length, 3);
});

test("a URL the tool must not fetch never becomes a candidate", async () => {
  freshStore("deny", [
    {
      id: "q-mixed-hosts",
      title: "Mixed host feed",
      intent: "Check that a non-fetchable host is refused rather than retrieved.",
      adapters: ["rss"],
      keywords: ["benchmark"],
      capability_ids: [],
      limit: 5,
      feeds: ["https://example.org/mixed-hosts.xml"],
    },
  ]);
  const { impl, calls } = fakeFetch((url) => {
    if (url.pathname === "/mixed-hosts.xml") {
      return { status: 200, body: fixture("rss-feed-mixed-hosts.xml"), contentType: "application/rss+xml" };
    }
    return { status: 200, body: pageFor(url.href), contentType: "text/html" };
  });

  const outcome = await discovery.runDiscovery({ fetchImpl: impl });
  const candidates = outcome.queries[0].candidates;

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source.canonical_url, "https://example.org/mixed/public-release-notes");
  assert.equal(
    calls.some((url) => url.includes("127.0.0.1")),
    false,
    "the denied host is never requested",
  );
});

test("a failed page retrieval is recorded with nulls instead of a fake hash", async () => {
  freshStore("retrieval-fail", [
    {
      id: "q-retrieval",
      title: "Retrieval failure handling",
      intent: "Check that a 404 page is recorded honestly as an unfetched lead.",
      adapters: ["rss"],
      keywords: ["benchmark"],
      capability_ids: [],
      limit: 1,
      feeds: ["https://example.org/rss-feed.xml"],
    },
  ]);
  const { impl } = fakeFetch((url) => {
    if (url.pathname === "/rss-feed.xml") {
      return { status: 200, body: RSS_FEED, contentType: "application/rss+xml" };
    }
    return { status: 404, body: "not found", contentType: "text/html" };
  });

  const outcome = await discovery.runDiscovery({ fetchImpl: impl });
  const candidate = outcome.queries[0].candidates[0] as CandidateRecord;

  assert.equal(candidate.source.canonical_url, "https://example.org/blog/long-horizon-agent-benchmark");
  assert.equal(candidate.retrieval.http_status, 404);
  assert.equal(candidate.retrieval.content_hash, null);
  assert.equal(candidate.retrieval.bytes !== null, true, "bytes of the error body are reported");
  assert.ok(candidate.retrieval.retrieved_at !== null);
  assert.match(candidate.notes.join(" "), /retrieval: HTTP 404/);
  assert.equal(candidate.status, "new");
});

/** One-entry RSS feed; `description` is CDATA so it can hold raw HTML. */
function singleItemFeed(input: { title: string; link: string; description: string }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Alignment Lab Notes</title>
    <item>
      <title>${input.title}</title>
      <link>${input.link}</link>
      <guid>guid-long-body</guid>
      <pubDate>Tue, 13 Feb 2024 09:00:00 GMT</pubDate>
      <description><![CDATA[${input.description}]]></description>
    </item>
  </channel>
</rss>`;
}

test("a full-article feed body becomes a bounded excerpt on the stored candidate", async () => {
  const root = freshStore("long-summary", [
    {
      id: "q-long",
      title: "Long body handling",
      intent: "Check that a feed shipping a whole article does not store the article.",
      adapters: ["rss"],
      keywords: ["benchmark"],
      capability_ids: [],
      limit: 1,
      feeds: ["https://example.org/long-feed.xml"],
    },
  ]);
  const longBody = `<p>${"Long-horizon benchmark notes with measured numbers. ".repeat(120)}</p>`;
  const feed = singleItemFeed({
    title: "Long-horizon agent benchmark results",
    link: "https://example.org/blog/long-horizon-agent-benchmark",
    description: longBody,
  });
  const { impl } = fakeFetch((url) => {
    if (url.pathname === "/long-feed.xml") {
      return { status: 200, body: feed, contentType: "application/rss+xml" };
    }
    return { status: 200, body: pageFor(url.href), contentType: "text/html" };
  });

  const outcome = await discovery.runDiscovery({ fetchImpl: impl });
  const candidate = outcome.queries[0].candidates[0] as CandidateRecord;

  assert.ok(candidate.summary.length <= 400, `summary kept ${candidate.summary.length} chars`);
  assert.equal(candidate.summary.includes("<"), false, "markup must not be stored as a summary");
  assert.equal(candidate.summary.endsWith("…"), true);
  assert.match(candidate.summary, /^Long-horizon benchmark notes/);

  // What reaches disk is the same excerpt, not the article.
  const stored = JSON.parse(readFileSync(candidateFiles(root)[0], "utf8")) as CandidateRecord;
  assert.equal(stored.summary, candidate.summary);
  assert.ok(readFileSync(candidateFiles(root)[0], "utf8").length < 4000);
});

test("a failed page retrieval keeps the feed excerpt instead of the error body", async () => {
  const root = freshStore("retrieval-429", [
    {
      id: "q-throttled",
      title: "Throttled retrieval",
      intent: "Check that a 429 error page is never stored as the candidate summary.",
      adapters: ["rss"],
      keywords: ["benchmark"],
      capability_ids: [],
      limit: 1,
      feeds: ["https://example.org/throttled-feed.xml"],
    },
  ]);
  const feed = singleItemFeed({
    title: "Long-horizon agent benchmark results",
    link: "https://example.org/blog/long-horizon-agent-benchmark",
    description: "<p>A benchmark of 40 multi-day tasks.</p>",
  });
  const { impl } = fakeFetch((url) => {
    if (url.pathname === "/throttled-feed.xml") {
      return { status: 200, body: feed, contentType: "application/rss+xml" };
    }
    return {
      status: 429,
      body: "<html><body><h1>429 Too Many Requests</h1><p>slow down</p></body></html>",
      contentType: "text/html",
    };
  });

  const outcome = await discovery.runDiscovery({ fetchImpl: impl });
  const candidate = outcome.queries[0].candidates[0] as CandidateRecord;

  assert.equal(candidate.retrieval.http_status, 429, "the real status is kept");
  assert.equal(candidate.retrieval.content_hash, null, "no hash is invented for an error page");
  assert.equal(candidate.summary, "A benchmark of 40 multi-day tasks.");
  assert.equal(candidate.summary.includes("Too Many Requests"), false);
  assert.match(candidate.notes.join(" "), /retrieval: HTTP 429/);
  assert.equal(jsonlLines(root).length, 1);
});

test("unknown query ids are refused instead of silently running nothing", async () => {
  freshStore("unknown-query");
  const { impl } = fakeFetch(defaultHandler);

  await assert.rejects(
    discovery.runDiscovery({ fetchImpl: impl, queryIds: ["q-does-not-exist"] }),
    /unknown discovery query "q-does-not-exist"/,
  );
});

test("an empty query selection runs no adapters", async () => {
  freshStore("empty-selection");
  const { impl, calls } = fakeFetch(defaultHandler);

  const outcome = await discovery.runDiscovery({ fetchImpl: impl, queryIds: [] });

  assert.deepEqual(outcome.queries, []);
  assert.equal(calls.length, 0);
  assert.deepEqual(outcome.totals, {
    candidates: 0,
    duplicates: 0,
    skipped_existing: 0,
    adapter_failures: 0,
    requests: 0,
  });
});

test("fetchRetrieval hashes the bytes it actually read and reports HTTP failures", async () => {
  const { impl } = fakeFetch((url) => {
    if (url.pathname === "/ok") return { status: 200, body: "<p>hello</p>", contentType: "text/html" };
    return { status: 503, body: "unavailable", contentType: "text/plain" };
  });

  const ok = await discovery.fetchRetrieval("https://example.org/ok", { fetchImpl: impl });
  assert.equal(ok.http_status, 200);
  assert.equal(ok.content_hash, store.sha256(new Uint8Array(Buffer.from("<p>hello</p>", "utf8"))));
  assert.equal(ok.bytes, 12);
  assert.equal(ok.content_type, "text/html");
  assert.equal(ok.error, null);

  const failed = await discovery.fetchRetrieval("https://example.org/down", { fetchImpl: impl });
  assert.equal(failed.http_status, 503);
  assert.equal(failed.content_hash, null);
  assert.equal(failed.bytes, 11);
  assert.match(failed.error ?? "", /HTTP 503/);

  const unreachable = await discovery.fetchRetrieval("https://example.org/throws", {
    fetchImpl: (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch,
  });
  assert.deepEqual(
    { ...unreachable },
    {
      retrieved_at: null,
      http_status: null,
      content_hash: null,
      bytes: null,
      content_type: null,
      error: "retrieval failed: network down",
    },
  );
});

test("the outcome type round-trips through JSON without losing fields", async () => {
  const root = freshStore("shape");
  const { impl } = fakeFetch(defaultHandler);
  const outcome = await discovery.runDiscovery({ fetchImpl: impl, queryIds: ["q-papers"] });
  const parsed = JSON.parse(
    readFileSync(path.join(root, ".evidence-mcp", "runs", "discovery", `${outcome.run_id}.json`), "utf8"),
  ) as DiscoveryOutcome;

  assert.deepEqual(parsed, outcome);
  assert.deepEqual(Object.keys(parsed).sort(), [
    "dry_run",
    "finished_at",
    "queries",
    "run_id",
    "started_at",
    "totals",
  ]);
});
