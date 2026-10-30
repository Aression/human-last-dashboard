/**
 * Small I/O helpers shared by discovery, quality maintenance, the MCP server, and
 * the daemon.
 *
 * Everything the tool writes lives under `<repo>/.evidence-mcp/`, which is
 * git-ignored: fetched pages, candidate records, audit findings, and run logs are
 * external content, not source. Nothing here can write into `lib/` or `app/`.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Repository root: the nearest ancestor holding the dashboard's package.json. */
export function findRepoRoot(start: string = import.meta.dirname ?? process.cwd()): string {
  const override = process.env.EVIDENCE_MCP_ROOT;
  if (override) return path.resolve(override);
  let dir = path.resolve(start);
  for (let i = 0; i < 10; i += 1) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSyncSafe(pkg)) as { name?: string };
        if (parsed.name === "human-last-dashboard") return dir;
      } catch {
        // unreadable package.json: keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("could not locate the dashboard repository root (set EVIDENCE_MCP_ROOT)");
}

function readFileSyncSafe(p: string): string {
  // Synchronous by design: only used during root discovery, once per process.
  return readFileSync(p, "utf8");
}

export interface StorePaths {
  root: string;
  home: string;
  candidates: string;
  quality: string;
  runs: string;
  reports: string;
  state: string;
  logs: string;
}

export function storePaths(root: string = findRepoRoot()): StorePaths {
  const home = path.join(root, ".evidence-mcp");
  return {
    root,
    home,
    candidates: path.join(home, "candidates"),
    quality: path.join(home, "quality"),
    runs: path.join(home, "runs"),
    reports: path.join(home, "reports"),
    state: path.join(home, "state"),
    logs: path.join(home, "logs"),
  };
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function ensureStore(p: StorePaths): Promise<void> {
  await Promise.all([
    ensureDir(p.candidates),
    ensureDir(p.quality),
    ensureDir(p.runs),
    ensureDir(p.reports),
    ensureDir(p.state),
    ensureDir(p.logs),
  ]);
}

/** Write JSON atomically: a reader never sees a half-written file. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function appendJsonl(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

export async function readJsonl<T>(file: string, limit?: number): Promise<T[]> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const slice = limit && lines.length > limit ? lines.slice(0, limit) : lines;
  return slice.map((line) => JSON.parse(line) as T);
}

export async function listDirFiles(dir: string): Promise<string[]> {
  try {
    const names = await import("node:fs/promises").then((fs) => fs.readdir(dir));
    return names.filter((n) => n.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function shortHash(input: string, length = 8): string {
  return sha256(input).slice(0, length);
}

export function nowIso(now: () => Date = () => new Date()): string {
  return now().toISOString();
}

export function dateStamp(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** Run ids sort chronologically and carry the task name for log scanning. */
export function newRunId(task: string, at: Date = new Date()): string {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${task}-${stamp}-${randomUUID().slice(0, 6)}`;
}

export function candidateId(url: string, at: Date = new Date()): string {
  return `cand-${at.getUTCFullYear()}-${shortHash(url)}`;
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `fn` while holding an exclusive lock file, so the daemon, a manual run, and
 * an agent-issued tool call never interleave writes into the same task.
 */
export async function withLock<T>(
  lockFile: string,
  fn: () => Promise<T>,
  options: { staleAfterMs?: number } = {},
): Promise<T> {
  await ensureDir(path.dirname(lockFile));
  const staleAfterMs = options.staleAfterMs ?? 30 * 60 * 1000;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(lockFile, "wx");
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
      "utf8",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // A lock left behind by a killed process must not block maintenance forever.
    try {
      const info = await stat(lockFile);
      if (Date.now() - info.mtimeMs > staleAfterMs) {
        await rm(lockFile, { force: true });
        return withLock(lockFile, fn, options);
      }
    } catch {
      // lock vanished between checks: fall through to the error below
    }
    throw new Error(`another run holds the lock: ${path.basename(lockFile)}`);
  } finally {
    // Released by the caller path below; kept open only for the duration of fn.
  }

  try {
    return await fn();
  } finally {
    await handle?.close();
    await rm(lockFile, { force: true });
  }
}

/** Minimal HTML → text extraction for pages that are fetched as HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise a URL for duplicate detection: drop fragments, trailing slashes, tracking params. */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref|ref_src|source|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    }
    let out = url.toString();
    if (out.endsWith("/") && url.pathname !== "/") out = out.slice(0, -1);
    return out;
  } catch {
    return raw.trim();
  }
}
