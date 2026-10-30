/**
 * Shared helpers for the discovery adapters (dependency-free by design: the tool
 * must not add packages for XML parsing, so the two feed formats are read with
 * small regex/state parsers here).
 *
 * Every adapter talks to the network through `fetchText` so the three of them
 * cannot drift on the properties that matter for an unattended run:
 *
 * - the tool's user-agent is always sent (search APIs and feeds rate-limit by it),
 * - every request carries an `AbortSignal.timeout`, so one hung host cannot stall a
 *   scheduled run indefinitely,
 * - the response body is capped (~2 MB), so a hostile or broken endpoint cannot
 *   exhaust memory,
 * - a network or HTTP error is *returned*, never thrown: an adapter reports the
 *   failure in `AdapterResult.error` and yields zero items rather than inventing
 *   (or partially fabricating) a result.
 *
 * Adapters are called with `AdapterContext`, which has no timeout field, so the
 * timeout is a module constant that mirrors `request_timeout_ms` in
 * `config/discovery.json`.
 */

import { htmlToText } from "../store";

export const ADAPTER_TIMEOUT_MS = 20_000;

/** Response cap. Anything larger is truncated and the truncation is reported. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface FetchTextOptions {
  /** Sent as the `user-agent` header on every request. */
  userAgent: string;
  /** Extra request headers (Accept, GitHub API version, …). */
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface FetchTextResult {
  ok: boolean;
  /** HTTP status, or 0 when the request never produced a response. */
  status: number;
  /** Decoded body, capped at `maxBytes`. Empty when the request failed. */
  text: string;
  /** Bytes actually captured (after the cap). */
  bytes: number;
  truncated: boolean;
  /** Present whenever `ok` is false, and also when a body was truncated. */
  error?: string;
}

/** One-line description of a thrown value, safe to store in a result or a note. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${error.message}: ${cause.message}`;
    if (typeof cause === "string" && cause) return `${error.message}: ${cause}`;
    return error.message || error.name;
  }
  return String(error);
}

export async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
  options: FetchTextOptions,
): Promise<FetchTextResult> {
  const timeoutMs = options.timeoutMs ?? ADAPTER_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": options.userAgent, ...(options.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: "",
      bytes: 0,
      truncated: false,
      error: `request failed: ${describeError(error)}`,
    };
  }

  let buffer: Uint8Array;
  try {
    buffer = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      text: "",
      bytes: 0,
      truncated: false,
      error: `response body could not be read: ${describeError(error)}`,
    };
  }

  const truncated = buffer.byteLength > maxBytes;
  const captured = truncated ? buffer.subarray(0, maxBytes) : buffer;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(captured);

  if (response.status < 200 || response.status > 299) {
    return {
      ok: false,
      status: response.status,
      text,
      bytes: captured.byteLength,
      truncated,
      error: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    };
  }

  return {
    ok: true,
    status: response.status,
    text,
    bytes: captured.byteLength,
    truncated,
    error: truncated ? `response truncated at ${maxBytes} bytes` : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Tiny XML readers.
 *
 * The inputs are machine-generated feeds and API documents, not arbitrary
 * documents, so a full XML parser is not warranted: these helpers extract
 * element text and attributes with namespace-tolerant regexes. Anything they
 * cannot find comes back as `null`, and callers must treat `null` as "the
 * publisher did not supply this", never as a value to invent.
 * ------------------------------------------------------------------ */

const NAMESPACE_PREFIX = "(?:[A-Za-z_][\\w.-]*:)?";

/** Inner XML of the first `<tag>`…`</tag>` in `block` (namespace prefix ignored). */
export function tagXml(block: string, tag: string, flags = "i"): string | null {
  const pattern = new RegExp(
    `<${NAMESPACE_PREFIX}${tag}\\b[^>]*>([\\s\\S]*?)</${NAMESPACE_PREFIX}${tag}\\s*>`,
    flags,
  );
  const match = pattern.exec(block);
  return match ? match[1] : null;
}

/** Text of the first `<tag>` in `block`, entity-decoded and whitespace-collapsed. */
export function tagText(block: string, tag: string): string | null {
  const inner = tagXml(block, tag);
  if (inner === null) return null;
  const text = collapseWhitespace(decodeXml(inner));
  return text.length > 0 ? text : null;
}

/** Attribute value from the first `<tag …>` in `block`. */
export function tagAttr(block: string, tag: string, attribute: string): string | null {
  const pattern = new RegExp(`<${NAMESPACE_PREFIX}${tag}\\b[^>]*>`, "i");
  const match = pattern.exec(block);
  if (!match) return null;
  return attr(match[0], attribute);
}

/** Attribute value from an element's opening tag text, e.g. `<link href="…" />`. */
export function attr(openTag: string, attribute: string): string | null {
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const match = pattern.exec(openTag);
  if (!match) return null;
  const value = decodeXml(match[2] ?? match[3] ?? "").trim();
  return value.length > 0 ? value : null;
}

/** All occurrences of an element's inner XML, in document order. */
export function elementBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(
    `<${NAMESPACE_PREFIX}${tag}\\b[^>]*>([\\s\\S]*?)</${NAMESPACE_PREFIX}${tag}\\s*>`,
    "gi",
  );
  const blocks: string[] = [];
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) blocks.push(match[1]);
  return blocks;
}

/** All opening tags for an element, in document order (self-closing included). */
export function elementOpenTags(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${NAMESPACE_PREFIX}${tag}\\b[^>]*>`, "gi");
  return xml.match(pattern) ?? [];
}

/** Escape-safe XML text decode for the handful of entities feeds actually emit. */
export function decodeXml(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Collapse the newlines and runs of spaces that feed generators insert, without
 * changing any words. Multi-line abstracts are only being un-wrapped here.
 */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * Normalise a feed/API date to `YYYY-MM-DD` (the only precision the model claims).
 * Returns null when the publisher supplied no date or an unparseable one.
 */
export function toIsoDate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Strip an HTML-ish summary down for keyword inspection (not for storage). */
export function plainText(input: string): string {
  return collapseWhitespace(decodeXml(input).replace(/<[^>]+>/g, " "));
}

/** Longest summary kept on a candidate: enough to recognise the source, not the article. */
export const SUMMARY_MAX_CHARS = 400;

/**
 * Turn a feed body into a short, tag-free excerpt.
 *
 * Feeds routinely ship the whole article in `<content:encoded>`/`<content>`, so the
 * "summary" field can be tens of kilobytes of HTML. This strips it to text, falls
 * back to `fallback` (the title) when nothing readable remains — an image-only body
 * yields no words — and cuts to `maxChars` with a single ellipsis when truncated.
 */
export function summaryExcerpt(
  raw: string | null | undefined,
  fallback = "",
  maxChars = SUMMARY_MAX_CHARS,
): string {
  const readable = readableText(raw);
  const text = readable.length > 0 ? readable : readableText(fallback);
  const limit = Math.max(1, Math.floor(maxChars));
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function readableText(input: string | null | undefined): string {
  if (typeof input !== "string" || input.trim().length === 0) return "";
  // Feed bodies are XML-escaped HTML (`&lt;p&gt;…`), so decode BEFORE stripping tags:
  // htmlToText strips tags first and would otherwise leave the decoded ones behind.
  const decoded = decodeXml(input);
  return collapseWhitespace(htmlToText(decoded).replace(/<[^>]*>/g, " "));
}
