/**
 * Adapter tests (arXiv, GitHub, RSS/Atom).
 *
 * No network: every adapter receives an injected `fetchImpl` that returns recorded
 * payloads from `tests/fixtures/`. `EVIDENCE_MCP_ROOT` points at a temporary
 * directory before the modules under test are imported, so nothing can read or
 * write the real repository store.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";

import type { Adapter, AdapterContext, DiscoverQuery } from "../src/contracts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const tempRoot = mkdtempSync(path.join(tmpdir(), "evidence-mcp-adapters-"));
process.env.EVIDENCE_MCP_ROOT = tempRoot;

let arxiv: typeof import("../src/adapters/arxiv");
let github: typeof import("../src/adapters/github");
let rss: typeof import("../src/adapters/rss");
let registry: typeof import("../src/adapters/index");

before(async () => {
  // Imported after EVIDENCE_MCP_ROOT is set: config/store must never resolve the
  // real repository while these tests run.
  arxiv = await import("../src/adapters/arxiv");
  github = await import("../src/adapters/github");
  rss = await import("../src/adapters/rss");
  registry = await import("../src/adapters/index");
});

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

interface FakeReply {
  status: number;
  body: string;
  contentType?: string;
}

/** Records every request and answers from `handler`; unknown routes fail loudly. */
function fakeFetch(handler: (url: URL) => FakeReply | null): {
  impl: typeof fetch;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = (async (input: unknown, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : String((input as { url?: string } | null)?.url ?? input);
    calls.push({ url: raw, init });
    const reply = handler(new URL(raw));
    if (!reply) throw new TypeError(`unexpected request in test: ${raw}`);
    return new Response(reply.body, {
      status: reply.status,
      headers: { "content-type": reply.contentType ?? "text/html; charset=utf-8" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function makeQuery(overrides: Partial<DiscoverQuery> = {}): DiscoverQuery {
  return {
    id: "q-test",
    title: "Test query",
    intent: "Exercise one adapter without touching the network.",
    adapters: ["arxiv"],
    keywords: ["recursive self-improvement"],
    capability_ids: [],
    limit: 5,
    ...overrides,
  };
}

function makeContext(
  query: DiscoverQuery,
  fetchImpl: typeof fetch,
  limit = query.limit,
): AdapterContext {
  return {
    query,
    limit,
    fetchImpl,
    now: () => new Date("2024-03-05T00:00:00Z"),
    userAgent: "human-last-dashboard-evidence-mcp-test/0.1",
  };
}

test("registry exposes one adapter per adapter id and rejects unknown ids", () => {
  assert.deepEqual(Object.keys(registry.adapters).sort(), ["arxiv", "github", "rss"]);
  assert.deepEqual(
    registry.staticAdapters.map((entry) => entry.id).sort(),
    ["arxiv", "github", "rss"],
  );
  assert.equal(registry.getAdapter("arxiv").id, "arxiv");
  assert.throws(() => registry.getAdapter("huggingface" as never), /no adapter implementation/);
  for (const adapter of Object.values(registry.adapters) as Adapter[]) {
    assert.equal(typeof adapter.run, "function");
    assert.ok(adapter.label.length > 0);
  }
});

test("arxiv: parses the Atom fixture into leads", () => {
  const entries = arxiv.parseArxivFeed(fixture("arxiv-atom.xml"));
  assert.equal(entries.length, 2);

  const first = entries[0];
  assert.equal(first.external_id, "2401.01234");
  assert.equal(first.url, "https://arxiv.org/abs/2401.01234");
  assert.equal(first.title, "Recursive Self-Improvement in Language Model Training Loops");
  assert.deepEqual(first.authors, ["Ada Lovelace", "Grace Hopper"]);
  assert.equal(first.published_at, "2024-01-03");
  assert.match(first.summary, /self-?improvement|improve the procedure/i);
  assert.equal(first.raw_meta.category, "cs.LG");
  assert.equal(first.raw_meta.updated, "2024-01-05T18:42:11Z");
  // multi-line abstract is un-wrapped, not truncated
  assert.ok(!first.summary.includes("\n"));

  const second = entries[1];
  assert.equal(second.external_id, "2402.05678");
  assert.deepEqual(second.authors, ["Barbara Liskov"]);
  assert.equal(second.raw_meta.category, "cs.SE");
});

test("arxiv: adapter queries the API, sends the user-agent and honours the limit", async () => {
  const feed = fixture("arxiv-atom.xml");
  const { impl, calls } = fakeFetch(() => ({ status: 200, body: feed, contentType: "application/atom+xml" }));
  const query = makeQuery({ keywords: ["recursive self-improvement", "self-improving language models"] });

  const result = await arxiv.arxivAdapter.run(makeContext(query, impl, 1));

  assert.equal(result.ok, true);
  assert.equal(result.adapter, "arxiv");
  assert.equal(result.requests, 1);
  assert.equal(result.items.length, 1, "ctx.limit caps the item count");
  assert.equal(result.error, undefined);

  const requested = new URL(calls[0].url);
  assert.equal(requested.hostname, "export.arxiv.org");
  assert.equal(requested.pathname, "/api/query");
  assert.equal(requested.searchParams.get("max_results"), "1");
  assert.equal(requested.searchParams.get("start"), "0");
  assert.equal(
    requested.searchParams.get("search_query"),
    'all:"recursive self-improvement" OR all:"self-improving language models"',
  );

  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers["user-agent"], "human-last-dashboard-evidence-mcp-test/0.1");
  assert.ok(calls[0].init?.signal instanceof AbortSignal, "requests carry an abort timeout");

  const item = result.items[0];
  assert.equal(item.adapter, "arxiv");
  assert.equal(item.publisher, "arXiv");
  assert.equal(item.url, "https://arxiv.org/abs/2401.01234");
  assert.equal(item.published_at, "2024-01-03");
});

test("arxiv: HTTP 500 becomes ok:false, never an invented item", async () => {
  const { impl } = fakeFetch(() => ({ status: 500, body: "internal error", contentType: "text/plain" }));
  const result = await arxiv.arxivAdapter.run(makeContext(makeQuery(), impl));

  assert.equal(result.ok, false);
  assert.deepEqual(result.items, []);
  assert.match(result.error ?? "", /500/);
});

test("arxiv: a non-feed payload is reported as a parse failure", async () => {
  const { impl } = fakeFetch(() => ({ status: 200, body: fixture("page-article.html") }));
  const result = await arxiv.arxivAdapter.run(makeContext(makeQuery(), impl));

  assert.equal(result.ok, false);
  assert.deepEqual(result.items, []);
  assert.match(result.error ?? "", /not an arXiv Atom feed/);
});

test("github: maps repositories, sends versioned headers and no token by default", async () => {
  const payload = fixture("github-search.json");
  const { impl, calls } = fakeFetch(() => ({
    status: 200,
    body: payload,
    contentType: "application/json; charset=utf-8",
  }));
  const previous = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;

  try {
    const query = makeQuery({
      adapters: ["github"],
      keywords: ["recursive self-improvement", "self-improving agent"],
    });
    const result = await github.githubAdapter.run(makeContext(query, impl, 2));

    assert.equal(result.ok, true);
    assert.equal(result.requests, 1);
    assert.equal(result.items.length, 2);

    const requested = new URL(calls[0].url);
    assert.equal(requested.origin, "https://api.github.com");
    assert.equal(requested.pathname, "/search/repositories");
    assert.equal(requested.searchParams.get("q"), "recursive self-improvement self-improving agent");
    assert.equal(requested.searchParams.get("sort"), "updated");
    assert.equal(requested.searchParams.get("per_page"), "2");

    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers.accept, "application/vnd.github+json");
    assert.equal(headers["x-github-api-version"], "2022-11-28");
    assert.equal(headers.authorization, undefined);

    const [first, second] = result.items;
    assert.equal(first.external_id, "acme/self-improving-agent");
    assert.equal(first.url, "https://github.com/acme/self-improving-agent");
    assert.equal(first.publisher, "acme");
    assert.equal(first.published_at, "2024-02-11");
    assert.equal(first.summary, "An agent runtime that rewrites its own planner between episodes.");
    assert.deepEqual(first.raw_meta, {
      stars: 412,
      language: "Python",
      topics: ["agents", "self-improvement", "planning"],
    });
    // A repo without a description keeps an empty summary rather than an invented one.
    assert.equal(second.summary, "");
    assert.equal(second.raw_meta.language, null);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previous;
  }
});

test("github: GITHUB_TOKEN is sent as a bearer header and never echoed", async () => {
  const payload = fixture("github-search.json");
  const { impl, calls } = fakeFetch(() => ({ status: 200, body: payload }));
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "ghp_test_secret_value_do_not_log";

  try {
    const result = await github.githubAdapter.run(
      makeContext(makeQuery({ adapters: ["github"] }), impl),
    );
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers.authorization, "Bearer ghp_test_secret_value_do_not_log");
    assert.ok(
      !JSON.stringify(result).includes("ghp_test_secret_value_do_not_log"),
      "the token must not appear in an adapter result",
    );
    assert.ok(!calls[0].url.includes("ghp_test_secret_value_do_not_log"));
  } finally {
    if (previous === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previous;
  }
});

test("github: a 500 is reported with the API message", async () => {
  const { impl } = fakeFetch(() => ({
    status: 500,
    body: JSON.stringify({ message: "Server Error", documentation_url: "https://docs.github.com" }),
    contentType: "application/json",
  }));
  const result = await github.githubAdapter.run(
    makeContext(makeQuery({ adapters: ["github"] }), impl),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.items, []);
  assert.match(result.error ?? "", /GitHub API 500: Server Error/);
});

test("rss: parses RSS 2.0 and Atom feeds into one item list", async () => {
  const rssBody = fixture("rss-feed.xml");
  const atomBody = fixture("atom-feed.xml");
  const { impl, calls } = fakeFetch((url) => {
    if (url.href === "https://example.org/feed.xml") {
      return { status: 200, body: rssBody, contentType: "application/rss+xml" };
    }
    if (url.href === "https://example.net/feed.xml") {
      return { status: 200, body: atomBody, contentType: "application/atom+xml" };
    }
    return null;
  });
  const query = makeQuery({
    adapters: ["rss"],
    feeds: ["https://example.org/feed.xml", "https://example.net/feed.xml"],
  });

  const result = await rss.rssAdapter.run(makeContext(query, impl, 10));

  assert.equal(result.ok, true);
  assert.equal(result.requests, 2);
  assert.equal(result.items.length, 4);

  const [rssItem, rssItemWithoutGuid, atomEntry, atomEntryWithoutDate] = result.items;

  assert.equal(rssItem.adapter, "rss");
  assert.equal(rssItem.external_id, "lab-notes-2024-02-14-benchmark");
  assert.equal(rssItem.url, "https://example.org/blog/long-horizon-agent-benchmark");
  assert.equal(rssItem.publisher, "Alignment Lab Notes");
  assert.equal(rssItem.published_at, "2024-02-13");
  assert.deepEqual(rssItem.authors, ["Rina Okafor"]);
  assert.match(rssItem.summary, /benchmark of 40 multi-day tasks/);

  // no <guid>: the link is the identifier
  assert.equal(rssItemWithoutGuid.external_id, "https://example.org/blog/tooling-grants");
  assert.equal(rssItemWithoutGuid.published_at, "2024-02-05");
  assert.deepEqual(rssItemWithoutGuid.authors, []);

  assert.equal(atomEntry.external_id, "urn:uuid:1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d");
  assert.equal(atomEntry.url, "https://example.net/posts/capability-evaluation-survey");
  assert.equal(atomEntry.publisher, "Safety Signals Feed");
  assert.equal(atomEntry.published_at, "2024-03-01");
  assert.match(atomEntry.summary, /^A survey of current evaluation practice/);

  // <content> is used when <summary> is absent, and no <published>/<updated> means null
  assert.equal(atomEntryWithoutDate.published_at, null);
  assert.match(atomEntryWithoutDate.summary, /attempted reproduction/);

  assert.deepEqual(
    calls.map((call) => call.url),
    ["https://example.org/feed.xml", "https://example.net/feed.xml"],
  );
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers["user-agent"], "human-last-dashboard-evidence-mcp-test/0.1");
});

test("rss: a failing feed is reported, surviving feeds still produce items", async () => {
  const { impl } = fakeFetch((url) => {
    if (url.hostname === "example.org") return { status: 500, body: "boom" };
    return { status: 200, body: fixture("atom-feed.xml"), contentType: "application/atom+xml" };
  });
  const query = makeQuery({
    adapters: ["rss"],
    feeds: ["https://example.org/feed.xml", "https://example.net/feed.xml"],
  });

  const result = await rss.rssAdapter.run(makeContext(query, impl, 10));

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.match(result.error ?? "", /some feeds failed/);
  assert.match(result.error ?? "", /example\.org\/feed\.xml: HTTP 500/);
});

test("rss: when every feed fails the result is ok:false", async () => {
  const { impl } = fakeFetch(() => ({ status: 500, body: "boom" }));
  const query = makeQuery({ adapters: ["rss"], feeds: ["https://example.org/feed.xml"] });

  const result = await rss.rssAdapter.run(makeContext(query, impl, 10));

  assert.equal(result.ok, false);
  assert.deepEqual(result.items, []);
  assert.match(result.error ?? "", /HTTP 500/);
});

test("rss: an HTML error page is not parsed as a feed", async () => {
  const { impl } = fakeFetch(() => ({ status: 200, body: fixture("page-article.html") }));
  const query = makeQuery({ adapters: ["rss"], feeds: ["https://example.org/feed.xml"] });

  const result = await rss.rssAdapter.run(makeContext(query, impl, 10));

  assert.equal(result.ok, false);
  assert.deepEqual(result.items, []);
  assert.match(result.error ?? "", /neither an RSS channel nor an Atom feed/);
});

test("rss: limit stops fetching once it is satisfied", async () => {
  const { impl, calls } = fakeFetch((url) => ({
    status: 200,
    body: url.hostname === "example.org" ? fixture("rss-feed.xml") : fixture("atom-feed.xml"),
    contentType: "application/xml",
  }));
  const query = makeQuery({
    adapters: ["rss"],
    feeds: ["https://example.org/feed.xml", "https://example.net/feed.xml"],
  });

  const result = await rss.rssAdapter.run(makeContext(query, impl, 1));

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.requests, 1);
  assert.equal(calls.length, 1);
});

test("parsers return nothing for empty or unrelated payloads", () => {
  assert.deepEqual(arxiv.parseArxivFeed(""), []);
  assert.deepEqual(arxiv.parseArxivFeed("<feed></feed>"), []);
  assert.deepEqual(github.parseGithubSearch({ items: [] }), []);
  assert.deepEqual(github.parseGithubSearch({}), []);
  assert.equal(rss.parseFeed("", "https://example.org/feed.xml").ok, false);
  assert.equal(rss.parseFeed("<html><body>nope</body></html>", "https://example.org/f.xml").ok, false);
  assert.equal(arxiv.normalizeArxivId("http://arxiv.org/abs/2401.01234v7"), "2401.01234");
  assert.equal(rss.parseFeed(fixture("rss-feed-mixed-hosts.xml"), "https://example.org/mixed.xml").ok, true);
});

/** A feed body shaped like a real post: multi-KB HTML with markup and images. */
function longArticleHtml(): string {
  const paragraph =
    "<p>An evaluation of long-horizon agent benchmarks, with notes on how the numbers were produced.</p>";
  const image = '<img src="https://example.org/charts/benchmark.png" alt="benchmark chart" />';
  return `${paragraph}\n  ${image}\n  ${paragraph.repeat(30)}`;
}

test("rss: a full-article <content:encoded> body becomes a short text excerpt", async () => {
  const body = longArticleHtml();
  assert.ok(body.length > 2000, "the fixture must be article-sized to prove truncation");
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Alignment Lab Notes</title>
    <item>
      <title>Long-horizon agent benchmark results</title>
      <link>https://example.org/blog/long-horizon-agent-benchmark</link>
      <guid>lab-notes-long-body</guid>
      <pubDate>Tue, 13 Feb 2024 09:00:00 GMT</pubDate>
      <content:encoded><![CDATA[${body}]]></content:encoded>
    </item>
  </channel>
</rss>`;
  const { impl } = fakeFetch(() => ({ status: 200, body: feed, contentType: "application/rss+xml" }));
  const query = makeQuery({ adapters: ["rss"], feeds: ["https://example.org/feed.xml"] });

  const result = await rss.rssAdapter.run(makeContext(query, impl, 5));

  assert.equal(result.ok, true);
  const summary = result.items[0].summary;
  assert.ok(summary.length <= 400, `summary kept ${summary.length} chars`);
  assert.equal(summary.includes("<"), false, "no markup may survive into a summary");
  assert.equal(summary.includes("img src"), false);
  assert.equal(summary.endsWith("…"), true, "a truncated excerpt is marked with an ellipsis");
  assert.match(summary, /^An evaluation of long-horizon agent benchmarks/);
});

test("rss: escaped HTML in an Atom <content> is decoded, stripped and truncated", async () => {
  const escaped = longArticleHtml().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Safety Signals Feed</title>
  <entry>
    <title>Unreproduced self-improvement claims</title>
    <id>urn:uuid:22222222-3333-4444-5555-666666666666</id>
    <link rel="alternate" href="https://example.net/posts/unreproduced-self-improvement" />
    <published>2024-03-01T00:00:00Z</published>
    <content type="html">${escaped}</content>
  </entry>
</feed>`;
  const { impl } = fakeFetch(() => ({ status: 200, body: feed, contentType: "application/atom+xml" }));
  const query = makeQuery({ adapters: ["rss"], feeds: ["https://example.net/feed.xml"] });

  const result = await rss.rssAdapter.run(makeContext(query, impl, 5));

  assert.equal(result.ok, true);
  const summary = result.items[0].summary;
  assert.ok(summary.length <= 400, `summary kept ${summary.length} chars`);
  assert.equal(summary.includes("<"), false, "escaped markup must not be decoded into the summary");
  assert.equal(summary.endsWith("…"), true);
  assert.match(summary, /^An evaluation of long-horizon agent benchmarks/);
});

test("rss: a body that is pure markup falls back to the title instead of an empty summary", () => {
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Alignment Lab Notes</title>
    <item>
      <title>Chart-only announcement</title>
      <link>https://example.org/blog/chart-only</link>
      <description>&lt;img src="https://example.org/charts/chart.png" /&gt;</description>
    </item>
  </channel>
</rss>`;

  const parsed = rss.parseFeed(feed, "https://example.org/feed.xml");

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.feed.entries[0].summary, "Chart-only announcement");
});

test("rss: a short plain-text description is kept verbatim", () => {
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Alignment Lab Notes</title>
    <item>
      <title>Short note</title>
      <link>https://example.org/blog/short-note</link>
      <description>A benchmark of 40 multi-day tasks.</description>
    </item>
  </channel>
</rss>`;

  const parsed = rss.parseFeed(feed, "https://example.org/feed.xml");

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.feed.entries[0].summary, "A benchmark of 40 multi-day tasks.");
});
