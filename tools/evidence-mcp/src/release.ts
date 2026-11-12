/**
 * Publish release: refresh the committed snapshot, commit only data/, push, deploy.
 *
 * The store is gitignored, so the public site can only show what has been written
 * into `data/` and pushed. This module is the deliberate step that does it, on a
 * schedule, without a human at the keyboard.
 *
 * Boundaries, because an unattended release is the one job that can make the site
 * wrong or make the repo dirty:
 *   - it never touches a file outside `data/`; any other dirty path refuses the run
 *   - it never rewrites history, never force-pushes, never tags, never merges
 *   - it refuses on a detached HEAD, where `HEAD:main` would be ambiguous
 *   - it skips the commit, the push and the deploy when `data/` has no change
 *   - tokens are read from the environment or a local env file and are redacted
 *     from every string this module records
 *
 * What it does NOT establish: that the published data is correct. A snapshot records
 * what the store held and what the audit said at that moment; it is not a claim.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import type { ReleaseResult, ReleaseStep } from "./contracts";
import { buildAutomationSnapshot } from "./snapshot";
import { findRepoRoot, withLock } from "./store";

const execFileAsync = promisify(execFile);

/** Env names this module looks at, most specific first. Documented in docs/automation.md. */
const GIT_TOKEN_VARS = ["HLD_GIT_TOKEN", "GITHUB_TOKEN", "GITHUB_DEV_TOKEN"];
const VERCEL_TOKEN_VARS = ["HLD_VERCEL_TOKEN", "VERCEL_TOKEN"];
const ENV_FILE_VAR = "HLD_ENV_FILE";
const DEFAULT_ENV_FILE = "D:\\devspace\\.env";
/** Keys inside the local env file (the file uses these exact spellings). */
const ENV_FILE_GIT_KEY = "GITHUB-DEV-TOKEN";
const ENV_FILE_VERCEL_KEY = "VERCEL_KEY";

/** Paths the release is allowed to stage. Everything else refuses the run. */
const STAGEABLE_PREFIXES = ["data/automation/", "data/curated/"];

export interface CommandOutput {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env?: Record<string, string> },
) => Promise<CommandOutput>;

export interface ReleaseOptions {
  root?: string;
  dryRun?: boolean;
  /** Defaults to true: pass false to commit and push without deploying. */
  deploy?: boolean;
  now?: Date;
  env?: Record<string, string | undefined>;
  envFile?: string;
  run?: CommandRunner;
}

interface Tokens {
  git: string | null;
  vercel: string | null;
  gitSource: string;
  vercelSource: string;
}

const defaultRunner: CommandRunner = async (command, args, options) => {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      shell: process.platform === "win32" && command === "npx",
    });
    return { code: 0, stdout: String(stdout), stderr: String(stderr) };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: String(failure.stdout ?? ""),
      stderr: String(failure.stderr ?? failure.message ?? ""),
    };
  }
};

/** Read `KEY=VALUE` lines. A malformed line is ignored; the file is not the source of truth. */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["'](.*)["']$/, "$1");
  }
  return out;
}

function readTokens(env: Record<string, string | undefined>, envFile: string): Tokens {
  const file = readEnvFile(envFile);
  const pick = (vars: string[], fileKey: string): { value: string | null; source: string } => {
    for (const name of vars) {
      const value = env[name];
      if (value && value.trim().length > 0) return { value: value.trim(), source: `env ${name}` };
    }
    const fromFile = file[fileKey];
    if (fromFile && fromFile.trim().length > 0) {
      return { value: fromFile.trim(), source: `${envFile} ${fileKey}` };
    }
    return { value: null, source: "not configured" };
  };
  const git = pick(GIT_TOKEN_VARS, ENV_FILE_GIT_KEY);
  const vercel = pick(VERCEL_TOKEN_VARS, ENV_FILE_VERCEL_KEY);
  return { git: git.value, vercel: vercel.value, gitSource: git.source, vercelSource: vercel.source };
}

/** Remove every secret this run knows about from a string we are about to store. */
function makeRedactor(tokens: Tokens): (text: string) => string {
  const secrets = [tokens.git, tokens.vercel].filter((t): t is string => Boolean(t));
  return (text: string) => {
    let out = text;
    for (const secret of secrets) {
      out = out.split(secret).join("[redacted]");
      const basic = Buffer.from(`x-access-token:${secret}`, "utf8").toString("base64");
      out = out.split(basic).join("[redacted]");
    }
    return out;
  };
}

function parseStatusPaths(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 3)
    .map((line) => {
      const path = line.slice(3).trim();
      // Rename lines read "R  old -> new"; the destination is what matters.
      const arrow = path.lastIndexOf(" -> ");
      return (arrow >= 0 ? path.slice(arrow + 4) : path).replace(/^"|"$/g, "").replace(/\\/g, "/");
    });
}

function stageable(path: string): boolean {
  return STAGEABLE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  return (line ?? "").trim();
}

/** Extract the deployment URL from `vercel deploy` output; returns null when absent. */
export function deploymentUrl(output: string): string | null {
  const match = /https:\/\/[a-z0-9-]+\.vercel\.app\b/i.exec(output);
  return match ? match[0] : null;
}

async function runReleaseUnlocked(options: ReleaseOptions = {}): Promise<ReleaseResult> {
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const env = options.env ?? process.env;
  const envFile = options.envFile ?? env[ENV_FILE_VAR] ?? DEFAULT_ENV_FILE;
  const root = resolve(options.root ?? findRepoRoot());
  const run = options.run ?? defaultRunner;
  const dryRun = options.dryRun === true;
  const deploy = options.deploy !== false;
  const tokens = readTokens(env, envFile);
  const redact = makeRedactor(tokens);
  const steps: ReleaseStep[] = [];

  const record = (name: ReleaseStep["name"], ok: boolean, detail: string): void => {
    steps.push({ name, ok, detail: redact(detail).slice(0, 2000) });
  };
  const finish = (
    ok: boolean,
    extra: Partial<ReleaseResult> = {},
  ): ReleaseResult => ({
    ok,
    dry_run: dryRun,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    steps,
    pushed: false,
    commit: null,
    deployment: null,
    ...extra,
  });

  // 1. The tree must be clean outside data/, and HEAD must have a branch name.
  const branch = await run("git", ["symbolic-ref", "--short", "HEAD"], { cwd: root });
  if (branch.code !== 0) {
    record("branch", false, `refused: HEAD is not on a branch (${firstLine(branch.stderr) || "detached"})`);
    return finish(false, { reason: "HEAD is not on a branch; a release cannot decide where to push" });
  }
  const branchName = branch.stdout.trim();
  record("branch", true, `on ${branchName}`);

  const status = await run("git", ["status", "--porcelain"], { cwd: root });
  if (status.code !== 0) {
    record("status", false, `git status failed: ${firstLine(status.stderr)}`);
    return finish(false, { reason: "git status failed" });
  }
  const dirty = parseStatusPaths(status.stdout);
  const unrelated = dirty.filter((path) => !stageable(path));
  if (unrelated.length > 0) {
    record("status", false, `refused: ${unrelated.length} path(s) outside data/ are modified: ${unrelated.slice(0, 5).join(", ")}`);
    return finish(false, {
      reason: "the working tree has changes outside data/; commit or stash them before releasing",
    });
  }
  record("status", true, dirty.length === 0 ? "clean" : `${dirty.length} path(s) under data/`);

  // 2. Rebuild the published snapshot from the store. A dry run must not touch data/.
  const snapshotPath = dryRun
    ? join(root, ".evidence-mcp", "tmp", "snapshot-dry-run.json")
    : join(root, "data", "automation", "snapshot.json");
  const built = await buildAutomationSnapshot({
    storeRoot: root,
    outPath: snapshotPath,
    now: () => now,
  });
  record(
    "snapshot",
    true,
    `${built.storedRecords} record(s) in the store, ${built.snapshot.candidates.items.length} published as rows, ${built.bytes} bytes`,
  );
  if (built.unreadableRecords.length > 0) {
    record("snapshot", true, `${built.unreadableRecords.length} stored record(s) could not be read and were skipped: ${built.unreadableRecords.slice(0, 5).join(", ")}`);
  }

  if (dryRun) {
    record("commit", true, "dry run: nothing staged, committed, pushed or deployed");
    return finish(true, { reason: "dry run" });
  }

  // 3. Stage and commit, but only if data/ actually changed.
  const dataStatus = await run("git", ["status", "--porcelain", "--", "data"], { cwd: root });
  if (dataStatus.code !== 0) {
    record("commit", false, `git status data/ failed: ${firstLine(dataStatus.stderr)}`);
    return finish(false, { reason: "git status failed" });
  }
  if (dataStatus.stdout.trim().length === 0) {
    record("commit", true, "no change under data/ since the last release, so nothing to commit");
    return finish(true, { reason: "no change under data/" });
  }
  const add = await run("git", ["add", "--", "data"], { cwd: root });
  if (add.code !== 0) {
    record("commit", false, `git add failed: ${firstLine(add.stderr)}`);
    return finish(false, { reason: "git add failed" });
  }
  const message = `chore(data): publish the automation snapshot for ${now.toISOString().slice(0, 10)}`;
  const commit = await run("git", ["commit", "-m", message], { cwd: root });
  if (commit.code !== 0) {
    record("commit", false, `git commit failed: ${firstLine(commit.stderr)}`);
    return finish(false, { reason: "git commit failed" });
  }
  const head = await run("git", ["rev-parse", "--short", "HEAD"], { cwd: root });
  const commitSha = head.code === 0 ? head.stdout.trim() : null;
  record("commit", true, `committed ${commitSha ?? "(unknown sha)"}: ${message}`);

  // 4. Push. The token rides in a one-shot config header, never in the remote URL.
  if (!tokens.git) {
    record("push", false, `refused: no git token (looked at ${GIT_TOKEN_VARS.join(", ")} and ${envFile} ${ENV_FILE_GIT_KEY})`);
    return finish(false, {
      reason: "a commit was created but no git token is configured, so it was not pushed",
      commit: commitSha,
    });
  }
  const basic = Buffer.from(`x-access-token:${tokens.git}`, "utf8").toString("base64");
  const push = await run(
    "git",
    ["-c", `http.extraheader=AUTHORIZATION: basic ${basic}`, "push", "origin", `HEAD:${branchName}`],
    { cwd: root, env: { GIT_TERMINAL_PROMPT: "0" } },
  );
  if (push.code !== 0) {
    record("push", false, `git push failed: ${firstLine(push.stderr) || firstLine(push.stdout)}`);
    return finish(false, { reason: "git push failed", commit: commitSha });
  }
  record("push", true, `pushed ${commitSha ?? "HEAD"} to origin ${branchName} (token from ${tokens.gitSource})`);

  // 5. Deploy the pushed build.
  if (!deploy) {
    record("deploy", true, "skipped: deploy disabled for this run");
    return finish(true, { commit: commitSha });
  }
  if (!tokens.vercel) {
    record("deploy", false, `refused: no Vercel token (looked at ${VERCEL_TOKEN_VARS.join(", ")} and ${envFile} ${ENV_FILE_VERCEL_KEY})`);
    return finish(false, {
      reason: "the commit was pushed but no Vercel token is configured, so nothing was deployed",
      commit: commitSha,
    });
  }
  const deployed = await run("npx", ["--yes", "vercel@latest", "deploy", "--prod", "--yes"], {
    cwd: root,
    env: { VERCEL_TOKEN: tokens.vercel },
  });
  const output = `${deployed.stdout}\n${deployed.stderr}`;
  const url = deploymentUrl(output);
  if (deployed.code !== 0) {
    record("deploy", false, `vercel deploy failed: ${firstLine(deployed.stderr) || firstLine(deployed.stdout)}`);
    return finish(false, { reason: "push succeeded but the deployment failed", commit: commitSha });
  }
  record("deploy", true, url ? `deployed ${url}` : "deployed (no URL in the output)");
  return finish(true, {
    commit: commitSha,
    pushed: true,
    deployment: { url, output: redact(output).slice(0, 4000) },
  });
}

/**
 * Run a release under a lock, so a scheduled run and a manual one cannot both
 * commit: two concurrent releases would produce two commits and two deployments.
 */
export async function runRelease(options: ReleaseOptions = {}): Promise<ReleaseResult> {
  const root = resolve(options.root ?? findRepoRoot());
  const lockFile = join(root, ".evidence-mcp", "state", "release.lock");
  try {
    return await withLock(lockFile, () => runReleaseUnlocked({ ...options, root }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/holds the lock/.test(message)) throw error;
    const at = new Date().toISOString();
    return {
      ok: false,
      dry_run: options.dryRun === true,
      started_at: at,
      finished_at: at,
      steps: [{ name: "status", ok: false, detail: message }],
      pushed: false,
      commit: null,
      deployment: null,
      reason: "another release is already running",
    };
  }
}

/** One-line summary for the CLI and the daemon log. */
export function summarizeRelease(result: ReleaseResult): string {
  const failed = result.steps.filter((step) => !step.ok);
  if (failed.length > 0) {
    const last = failed[failed.length - 1];
    return `release failed at ${last.name}: ${last.detail}`;
  }
  const parts = [
    result.commit ? `commit ${result.commit}` : "no commit",
    result.pushed ? "pushed" : "not pushed",
    result.deployment?.url ? `deployed ${result.deployment.url}` : "not deployed",
  ];
  return `release ok: ${parts.join(", ")}${result.reason ? ` (${result.reason})` : ""}`;
}
