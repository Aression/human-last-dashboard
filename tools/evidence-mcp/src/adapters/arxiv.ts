/**
 * arXiv adapter.
 *
 * Queries the arXiv Atom API and maps each `<entry>` to a lead. Only what the
 * feed actually says is recorded: the abstract is copied verbatim (line-wrapped
 * text is un-wrapped, words untouched), and a missing date stays `null`.
 *
 * Redirects are followed (`fetchText` sets `redirect: "follow"`): from this
 * machine `export.arxiv.org` has answered with a 301 before serving the feed.
 */
import type { Adapter, AdapterContext, AdapterResult, DiscoverQuery, DiscoveryItem } from "../contracts";
import {
  collapseWhitespace,
  describeError,
  elementBlocks,
  fetchText,
  tagAttr,
  tagText,
  toIsoDate,
} from "./shared";

export const ARXIV_API_BASE = "https://export.arxiv.org/api/query";
export const ARXIV_ABS_BASE = "https://arxiv.org/abs/";

/** One parsed `<entry>`: the subset of the Atom entry this tool records. */
export interface ArxivEntry {
  external_id: string;
  title: string;
  url: string;
  authors: string[];
  published_at: string | null;
  summary: string;
  raw_meta: Record<string, unknown>;
}

/**
 * Free-text keywords become an `all:"…" OR …` query. Keywords are quoted so a
 * phrase stays a phrase; the API, not this adapter, decides what matches.
 */
export function buildArxivQueryUrl(query: DiscoverQuery, limit: number): string {
  const terms = (query.keywords.length > 0 ? query.keywords : [query.title])
    .map((keyword) => collapseWhitespace(keyword).replace(/"/g, ""))
    .filter((keyword) => keyword.length > 0);
  const search = terms.map((keyword) => `all:"${keyword}"`).join(" OR ");
  const params = new URLSearchParams({
    search_query: search,
    start: "0",
    max_results: String(Math.max(1, Math.floor(limit))),
  });
  return `${ARXIV_API_BASE}?${params.toString()}`;
}

/** True when the payload is an Atom document (so an error page is not parsed as one). */
export function looksLikeAtomFeed(xml: string): boolean {
  return /<feed\b/i.test(xml);
}

/**
 * arXiv identifiers arrive as `http://arxiv.org/abs/2401.01234v2`; the version
 * suffix is dropped so the same paper discovered twice collapses to one lead.
 */
export function normalizeArxivId(rawId: string): string {
  const match = /abs\/([^/\s?#]+)/.exec(rawId);
  const candidate = (match ? match[1] : rawId).trim();
  return candidate.replace(/v\d+$/i, "");
}

export function parseArxivFeed(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  for (const block of elementBlocks(xml, "entry")) {
    const rawId = tagText(block, "id") ?? "";
    const externalId = normalizeArxivId(rawId);
    if (externalId.length === 0) continue;
    const authors = elementBlocks(block, "author")
      .map((authorBlock) => tagText(authorBlock, "name"))
      .filter((name): name is string => name !== null && name.length > 0);
    const category =
      tagAttr(block, "primary_category", "term") ?? tagAttr(block, "category", "term") ?? null;
    const updated = tagText(block, "updated");
    entries.push({
      external_id: externalId,
      title: tagText(block, "title") ?? externalId,
      url: `${ARXIV_ABS_BASE}${externalId}`,
      authors,
      published_at: toIsoDate(tagText(block, "published")),
      summary: tagText(block, "summary") ?? "",
      raw_meta: { category, updated },
    });
  }
  return entries;
}

export function toDiscoveryItem(entry: ArxivEntry): DiscoveryItem {
  return {
    adapter: "arxiv",
    external_id: entry.external_id,
    title: entry.title,
    url: entry.url,
    publisher: "arXiv",
    authors: entry.authors,
    published_at: entry.published_at,
    summary: entry.summary,
    raw_meta: entry.raw_meta,
  };
}

async function run(ctx: AdapterContext): Promise<AdapterResult> {
  const startedAt = Date.now();
  const result: AdapterResult = {
    adapter: "arxiv",
    ok: false,
    items: [],
    requests: 0,
    duration_ms: 0,
  };
  const limit = Math.max(0, Math.floor(ctx.limit));
  if (limit === 0) {
    return { ...result, ok: true, duration_ms: Date.now() - startedAt };
  }

  try {
    const url = buildArxivQueryUrl(ctx.query, limit);
    result.requests = 1;
    const response = await fetchText(ctx.fetchImpl, url, {
      userAgent: ctx.userAgent,
      headers: { accept: "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8" },
    });
    result.duration_ms = Date.now() - startedAt;

    if (!response.ok) {
      return { ...result, error: response.error ?? `HTTP ${response.status}` };
    }
    if (!looksLikeAtomFeed(response.text)) {
      return { ...result, error: "response was not an arXiv Atom feed" };
    }

    const entries = parseArxivFeed(response.text);
    return {
      ...result,
      ok: true,
      items: entries.slice(0, limit).map(toDiscoveryItem),
      // Omit the key entirely on success: an `error: undefined` would not survive JSON.
      ...(response.truncated
        ? { error: `${response.error ?? "response truncated"}; parsed entries may be incomplete` }
        : {}),
    };
  } catch (error) {
    // A parser/edge-case bug must degrade to a reported failure, not a crashed run.
    return { ...result, error: `arxiv adapter failed: ${describeError(error)}` };
  }
}

export const arxivAdapter: Adapter = {
  id: "arxiv",
  label: "arXiv",
  run,
};
