/**
 * RSS / Atom adapter.
 *
 * One feed family, two serialisations: RSS 2.0 (`<channel>` / `<item>`) and Atom
 * (`<feed>` / `<entry>`). The parser is dependency-free and deliberately literal:
 * it reads the fields that identify and date an entry, keeps the publisher's own
 * summary text, and leaves `published_at` null when the feed supplies no date
 * that can be parsed. Nothing here guesses a publication date.
 *
 * A feed that fails is reported, not hidden: if every configured feed fails the
 * adapter returns `ok: false`; if only some fail, the successful entries are
 * returned with the failure listed in `error` so the run still records it.
 */
import type { Adapter, AdapterContext, AdapterResult, DiscoverQuery, DiscoveryItem } from "../contracts";
import {
  attr,
  collapseWhitespace,
  describeError,
  elementBlocks,
  elementOpenTags,
  fetchText,
  summaryExcerpt,
  tagText,
  toIsoDate,
} from "./shared";

export interface FeedEntry {
  external_id: string;
  title: string;
  url: string;
  publisher: string;
  authors: string[];
  published_at: string | null;
  summary: string;
  raw_meta: Record<string, unknown>;
}

export interface ParsedFeed {
  kind: "rss" | "atom";
  title: string;
  entries: FeedEntry[];
}

export type ParsedFeedResult = { ok: true; feed: ParsedFeed } | { ok: false; error: string };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** RSS `<link>` is element text; Atom `<link>` is an attribute on a self-closing tag. */
function rssLink(block: string): string | null {
  const text = tagText(block, "link");
  if (text) return text;
  for (const openTag of elementOpenTags(block, "link")) {
    const href = attr(openTag, "href");
    if (href) return href;
  }
  return null;
}

function atomLink(block: string): string | null {
  const tags = elementOpenTags(block, "link");
  const alternate = tags.find((openTag) => attr(openTag, "rel") === "alternate");
  const chosen = alternate ?? tags[0];
  if (chosen) {
    const href = attr(chosen, "href");
    if (href) return href;
  }
  return rssLink(block);
}

function rssEntries(xml: string, publisher: string, feedUrl: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const block of elementBlocks(xml, "item")) {
    const url = rssLink(block);
    if (!url) continue;
    const guid = tagText(block, "guid") ?? tagText(block, "id");
    const author = tagText(block, "creator") ?? tagText(block, "author");
    const title = tagText(block, "title") ?? url;
    // `<description>` is usually an excerpt, but publishers that emit
    // `<content:encoded>` put the whole article in the feed; both are reduced to a
    // short text excerpt so a candidate never stores an article body as its summary.
    const body = tagText(block, "description") ?? tagText(block, "encoded");
    entries.push({
      external_id: guid ?? url,
      title,
      url,
      publisher,
      authors: author ? [author] : [],
      published_at: toIsoDate(tagText(block, "pubDate") ?? tagText(block, "date")),
      summary: summaryExcerpt(body, title),
      raw_meta: { feed_url: feedUrl, kind: "rss" },
    });
  }
  return entries;
}

function atomEntries(xml: string, publisher: string, feedUrl: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const block of elementBlocks(xml, "entry")) {
    const url = atomLink(block);
    if (!url) continue;
    const id = tagText(block, "id");
    const authorBlock = elementBlocks(block, "author")[0];
    const author = authorBlock ? tagText(authorBlock, "name") : tagText(block, "author");
    const title = tagText(block, "title") ?? url;
    // Atom `<content>` carries the full post body as escaped HTML; the excerpt helper
    // decodes it and strips the markup before it can be stored as a summary.
    const body = tagText(block, "summary") ?? tagText(block, "content");
    entries.push({
      external_id: id ?? url,
      title,
      url,
      publisher,
      authors: author ? [author] : [],
      published_at: toIsoDate(tagText(block, "published") ?? tagText(block, "updated")),
      summary: summaryExcerpt(body, title),
      raw_meta: { feed_url: feedUrl, kind: "atom" },
    });
  }
  return entries;
}

/**
 * Parse one feed document. Returns `{ ok: false }` for anything that is neither an
 * RSS channel nor an Atom feed, so an HTML error page is never read as entries.
 */
export function parseFeed(xml: string, feedUrl: string): ParsedFeedResult {
  if (typeof xml !== "string" || xml.trim().length === 0) {
    return { ok: false, error: "empty feed body" };
  }
  const isRss = /<rss\b/i.test(xml) || /<channel\b/i.test(xml);
  const isAtom = /<feed\b/i.test(xml);

  if (isRss) {
    const channel = elementBlocks(xml, "channel")[0] ?? xml;
    const title = tagText(channel, "title") ?? hostOf(feedUrl);
    return { ok: true, feed: { kind: "rss", title, entries: rssEntries(channel, title, feedUrl) } };
  }
  if (isAtom) {
    // The feed-level <title> is the first one in document order; entry titles follow.
    const title = tagText(xml, "title") ?? hostOf(feedUrl);
    return { ok: true, feed: { kind: "atom", title, entries: atomEntries(xml, title, feedUrl) } };
  }
  return { ok: false, error: "response was neither an RSS channel nor an Atom feed" };
}

export function toDiscoveryItem(entry: FeedEntry): DiscoveryItem {
  return {
    adapter: "rss",
    external_id: entry.external_id,
    title: entry.title,
    url: entry.url,
    publisher: entry.publisher,
    authors: entry.authors,
    published_at: entry.published_at,
    summary: entry.summary,
    raw_meta: entry.raw_meta,
  };
}

export function feedUrls(query: DiscoverQuery): string[] {
  return (query.feeds ?? []).map((feed) => collapseWhitespace(feed)).filter((feed) => feed.length > 0);
}

async function run(ctx: AdapterContext): Promise<AdapterResult> {
  const startedAt = Date.now();
  const result: AdapterResult = {
    adapter: "rss",
    ok: false,
    items: [],
    requests: 0,
    duration_ms: 0,
  };
  const limit = Math.max(0, Math.floor(ctx.limit));
  const feeds = feedUrls(ctx.query);
  if (limit === 0) {
    return { ...result, ok: true, duration_ms: Date.now() - startedAt };
  }
  if (feeds.length === 0) {
    return { ...result, error: "rss adapter needs at least one feed URL" };
  }

  const items: DiscoveryItem[] = [];
  const failures: string[] = [];
  try {
    for (const feedUrl of feeds) {
      if (items.length >= limit) break;
      result.requests += 1;
      const response = await fetchText(ctx.fetchImpl, feedUrl, {
        userAgent: ctx.userAgent,
        headers: { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5" },
      });
      if (!response.ok) {
        failures.push(`${feedUrl}: ${response.error ?? `HTTP ${response.status}`}`);
        continue;
      }
      const parsed = parseFeed(response.text, feedUrl);
      if (!parsed.ok) {
        failures.push(`${feedUrl}: ${parsed.error}`);
        continue;
      }
      for (const entry of parsed.feed.entries) {
        if (items.length >= limit) break;
        items.push(toDiscoveryItem(entry));
      }
    }
  } catch (error) {
    return {
      ...result,
      duration_ms: Date.now() - startedAt,
      items,
      error: `rss adapter failed: ${describeError(error)}`,
    };
  }

  result.duration_ms = Date.now() - startedAt;
  result.items = items;

  if (items.length === 0 && failures.length > 0) {
    return { ...result, ok: false, error: failures.join("; ") };
  }
  return {
    ...result,
    ok: true,
    // Partial failures are reported even on success: a silently skipped feed looks
    // like a quiet week and would hide a broken configuration. Omit the key when
    // everything worked so the result survives a JSON round-trip unchanged.
    ...(failures.length > 0 ? { error: `some feeds failed: ${failures.join("; ")}` } : {}),
  };
}

export const rssAdapter: Adapter = {
  id: "rss",
  label: "RSS / Atom feeds",
  run,
};
