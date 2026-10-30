/**
 * GitHub adapter.
 *
 * Uses the repository search API in its versioned form. `GITHUB_TOKEN` is read
 * from the environment when present (unauthenticated search is heavily
 * rate-limited) and is only ever placed in the `authorization` request header:
 * it is never put in a URL, a result, an error string, or a log line.
 *
 * Repository metadata is a lead about a project's own claims, not evidence:
 * a description that says "self-improving" is the author's word for it.
 */
import type { Adapter, AdapterContext, AdapterResult, DiscoverQuery, DiscoveryItem } from "../contracts";
import { collapseWhitespace, describeError, fetchText, toIsoDate } from "./shared";

export const GITHUB_SEARCH_BASE = "https://api.github.com/search/repositories";
export const GITHUB_API_VERSION = "2022-11-28";

/** Minimal shape of a search result item this adapter reads. */
export interface GithubRepo {
  full_name?: unknown;
  html_url?: unknown;
  description?: unknown;
  pushed_at?: unknown;
  stargazers_count?: unknown;
  language?: unknown;
  topics?: unknown;
  owner?: { login?: unknown } | null;
}

export function buildGithubQueryUrl(query: DiscoverQuery, limit: number): string {
  const terms = (query.keywords.length > 0 ? query.keywords : [query.title])
    .map((keyword) => collapseWhitespace(keyword))
    .filter((keyword) => keyword.length > 0);
  const params = new URLSearchParams({
    q: terms.join(" "),
    sort: "updated",
    per_page: String(Math.max(1, Math.floor(limit))),
  });
  return `${GITHUB_SEARCH_BASE}?${params.toString()}`;
}

/**
 * Request headers. The token is optional: without it the API still answers, just
 * with a much smaller hourly allowance.
 */
export function buildGithubHeaders(
  userAgent: string,
  token: string | undefined = process.env.GITHUB_TOKEN,
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": GITHUB_API_VERSION,
  };
  const trimmed = token?.trim();
  if (trimmed) headers.authorization = `Bearer ${trimmed}`;
  // The user-agent is applied by fetchText; keep the argument for call-site clarity.
  void userAgent;
  return headers;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export interface GithubParsedItem {
  external_id: string;
  title: string;
  url: string;
  publisher: string;
  published_at: string | null;
  summary: string;
  raw_meta: Record<string, unknown>;
}

/** Maps `items[]` to discovery rows, dropping entries without a usable name/URL. */
export function parseGithubSearch(payload: unknown): GithubParsedItem[] {
  if (typeof payload !== "object" || payload === null) return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const parsed: GithubParsedItem[] = [];
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const repo = raw as GithubRepo;
    const fullName = asString(repo.full_name);
    const url = asString(repo.html_url);
    if (!fullName || !url) continue;
    const owner = asString(repo.owner?.login) ?? fullName.split("/")[0] ?? "GitHub";
    parsed.push({
      external_id: fullName,
      title: fullName,
      url,
      publisher: owner,
      published_at: toIsoDate(asString(repo.pushed_at)),
      summary: asString(repo.description) ?? "",
      raw_meta: {
        stars: asNumber(repo.stargazers_count),
        language: asString(repo.language),
        topics: asStringArray(repo.topics),
      },
    });
  }
  return parsed;
}

export function toDiscoveryItem(item: GithubParsedItem): DiscoveryItem {
  return {
    adapter: "github",
    external_id: item.external_id,
    title: item.title,
    url: item.url,
    publisher: item.publisher,
    authors: [],
    published_at: item.published_at,
    summary: item.summary,
    raw_meta: item.raw_meta,
  };
}

/** GitHub error bodies carry a human message; surface it without echoing headers. */
function githubErrorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    const message = asString(parsed.message);
    if (message) return `GitHub API ${status}: ${message}`;
  } catch {
    // not JSON: fall through to the status-only message
  }
  return `GitHub API returned HTTP ${status}`;
}

async function run(ctx: AdapterContext): Promise<AdapterResult> {
  const startedAt = Date.now();
  const result: AdapterResult = {
    adapter: "github",
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
    const url = buildGithubQueryUrl(ctx.query, limit);
    result.requests = 1;
    const response = await fetchText(ctx.fetchImpl, url, {
      userAgent: ctx.userAgent,
      headers: buildGithubHeaders(ctx.userAgent),
    });
    result.duration_ms = Date.now() - startedAt;

    if (!response.ok) {
      return { ...result, error: githubErrorMessage(response.text, response.status) };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(response.text) as unknown;
    } catch (error) {
      return { ...result, error: `GitHub response was not valid JSON: ${describeError(error)}` };
    }

    const parsed = parseGithubSearch(payload);
    return {
      ...result,
      ok: true,
      items: parsed.slice(0, limit).map(toDiscoveryItem),
      // Omit the key entirely on success: an `error: undefined` would not survive JSON.
      ...(response.truncated
        ? { error: `${response.error ?? "response truncated"}; parsed items may be incomplete` }
        : {}),
    };
  } catch (error) {
    return { ...result, error: `github adapter failed: ${describeError(error)}` };
  }
}

export const githubAdapter: Adapter = {
  id: "github",
  label: "GitHub",
  run,
};
