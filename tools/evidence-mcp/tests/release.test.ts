/**
 * Tests for the publish release.
 *
 * The release is the one automation step that writes into the repository and
 * pushes it, so these tests pin the refusals rather than the happy path alone:
 * a file outside `data/`, a detached HEAD, a missing token, and a run where
 * `data/` simply has not changed must each stop before anything is published.
 * The git and npx invocations are injected, so no test touches the network, the
 * real repository or the Vercel API.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import "./support/isolate";
import type { CommandRunner } from "../src/release";
import { deploymentUrl, runRelease, summarizeRelease } from "../src/release";
import { buildAutomationSnapshot } from "../src/snapshot";

const FAKE_GIT_TOKEN = "gh-token-value-that-must-never-be-logged";
const FAKE_VERCEL_TOKEN = "vercel-token-value-that-must-never-be-logged";

interface Call {
  command: string;
  args: string[];
}

/** Build a runner from a table of handlers keyed by the leading git subcommand. */
function makeRunner(handlers: Record<string, (call: Call) => { code?: number; stdout?: string; stderr?: string }>) {
  const calls: Call[] = [];
  const runner: CommandRunner = async (command, args) => {
    const call = { command, args };
    calls.push(call);
    const key = command === "npx" ? "npx" : args.filter((a) => !a.startsWith("-") && !a.includes("="))[0] ?? "";
    const handler = handlers[key];
    const result = handler ? handler(call) : { code: 0, stdout: "", stderr: "" };
    return {
      code: result.code ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };
  return { runner, calls };
}

const cleanStatus = () => ({ stdout: "" });

function tokens() {
  return { env: { HLD_GIT_TOKEN: FAKE_GIT_TOKEN, HLD_VERCEL_TOKEN: FAKE_VERCEL_TOKEN } as Record<string, string> };
}

describe("runRelease", () => {
  let root = "";

  before(async () => {
    root = await mkdtemp(join(os.tmpdir(), "evidence-release-"));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("refuses when a file outside data/ is modified", async () => {
    const { runner, calls } = makeRunner({
      "symbolic-ref": () => ({ stdout: "main\n" }),
      status: () => ({ stdout: " M README.md\n" }),
    });
    const result = await runRelease({ root, run: runner, ...tokens() });

    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /outside data\//);
    assert.equal(result.steps.some((s) => s.name === "commit"), false);
    assert.equal(calls.some((c) => c.args.includes("add")), false);
  });

  it("refuses on a detached HEAD before reading the tree", async () => {
    const { runner, calls } = makeRunner({
      "symbolic-ref": () => ({ code: 1, stderr: "fatal: not a git repository" }),
    });
    const result = await runRelease({ root, run: runner, ...tokens() });

    assert.equal(result.ok, false);
    assert.equal(calls.some((c) => c.args.includes("status")), false);
    assert.match(summarizeRelease(result), /release failed at branch/);
  });

  it("writes no snapshot into data/ during a dry run", async () => {
    const { runner, calls } = makeRunner({
      "symbolic-ref": () => ({ stdout: "main\n" }),
      status: cleanStatus,
    });
    const result = await runRelease({ root, run: runner, dryRun: true, ...tokens() });

    assert.equal(result.ok, true);
    assert.equal(result.dry_run, true);
    assert.equal(calls.some((c) => c.args.includes("commit")), false);
    assert.equal(calls.some((c) => c.command === "npx"), false);
    const dryFile = join(root, ".evidence-mcp", "tmp", "snapshot-dry-run.json");
    const written = await readFile(dryFile, "utf8");
    assert.match(written, /"schema_version": 1/);
    await assert.rejects(readFile(join(root, "data", "automation", "snapshot.json"), "utf8"));
  });

  it("stops after the snapshot when data/ has not changed", async () => {
    const { runner, calls } = makeRunner({
      "symbolic-ref": () => ({ stdout: "main\n" }),
      status: (call) => (call.args.includes("--") ? { stdout: "" } : { stdout: "" }),
    });
    const result = await runRelease({ root, run: runner, ...tokens() });

    assert.equal(result.ok, true);
    assert.match(result.reason ?? "", /no change under data\//);
    assert.equal(result.pushed, false);
    assert.equal(calls.some((c) => c.args.includes("push")), false);
  });

  it("commits, pushes and deploys, and never records a token", async () => {
    const { runner, calls } = makeRunner({
      "symbolic-ref": () => ({ stdout: "main\n" }),
      status: (call) =>
        call.args.includes("--") ? { stdout: " M data/automation/snapshot.json\n" } : { stdout: " M data/automation/snapshot.json\n" },
      add: () => ({}),
      commit: () => ({ stdout: "" }),
      "rev-parse": () => ({ stdout: "abc1234\n" }),
      push: () => ({ stderr: "To github.com:Aression/human-last-dashboard.git\n" }),
      npx: () => ({ stdout: "▲ Aliased https://human-last-dashboard.vercel.app\n" }),
    });
    const result = await runRelease({ root, run: runner, ...tokens() });

    assert.equal(result.ok, true, summarizeRelease(result));
    assert.equal(result.commit, "abc1234");
    assert.equal(result.pushed, true);
    assert.equal(result.deployment?.url, "https://human-last-dashboard.vercel.app");
    const pushCall = calls.find((c) => c.args.includes("push"));
    assert.ok(pushCall, "expected a git push");
    // The token rides in a config header, not in the remote URL.
    assert.ok(pushCall.args.some((a) => a.startsWith("http.extraheader=")));
    assert.equal(pushCall.args.some((a) => a.includes(FAKE_GIT_TOKEN)), false);
    const rendered = JSON.stringify(result);
    assert.equal(rendered.includes(FAKE_GIT_TOKEN), false);
    assert.equal(rendered.includes(FAKE_VERCEL_TOKEN), false);
    assert.equal(rendered.includes(Buffer.from(`x-access-token:${FAKE_GIT_TOKEN}`).toString("base64")), false);
  });

  it("keeps the commit but refuses to push without a git token", async () => {
    const { runner } = makeRunner({
      "symbolic-ref": () => ({ stdout: "main\n" }),
      status: () => ({ stdout: " M data/curated/records.json\n" }),
      commit: () => ({}),
      "rev-parse": () => ({ stdout: "def5678\n" }),
    });
    const result = await runRelease({
      root,
      run: runner,
      env: {},
      envFile: join(root, "no-such-env-file"),
    });

    assert.equal(result.ok, false);
    assert.equal(result.commit, "def5678");
    assert.equal(result.pushed, false);
    assert.match(result.reason ?? "", /no git token/);
  });
  it("refuses while another release holds the lock", async () => {
    const lockDir = join(root, ".evidence-mcp", "state");
    await mkdir(lockDir, { recursive: true });
    const lock = join(lockDir, "release.lock");
    await writeFile(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
    const { runner, calls } = makeRunner({});
    try {
      const result = await runRelease({ root, run: runner, ...tokens() });
      assert.equal(result.ok, false);
      assert.match(result.reason ?? "", /already running/);
      assert.equal(calls.length, 0, "a locked release must not run a single command");
    } finally {
      await rm(lock, { force: true });
    }
  });
  it("keeps the published bytes when only generated_at would change", async () => {
    const { runner, calls } = makeRunner({
      "symbolic-ref": () => ({ stdout: "main\n" }),
      status: cleanStatus,
    });
    const outPath = join(root, "data", "automation", "snapshot.json");
    const seeded = await buildAutomationSnapshot({
      storeRoot: root,
      outPath,
      now: () => new Date("2020-01-01T00:00:00.000Z"),
    });
    const before = await readFile(outPath, "utf8");
    assert.match(before, /"generated_at": "2020-01-01T00:00:00.000Z"/);

    const result = await runRelease({ root, run: runner, ...tokens() });

    const after = await readFile(outPath, "utf8");
    assert.equal(after, before, "the file must keep the timestamp it was published with");
    assert.equal(result.ok, true);
    assert.match(result.reason ?? "", /no change under data\//);
    assert.equal(result.steps.some((s) => /kept the previous bytes/.test(s.detail)), true);
    assert.equal(calls.some((c) => c.args.includes("commit")), false);
    assert.equal(seeded.snapshot.candidates.total, 0);
  });
});

describe("deploymentUrl", () => {
  it("reads the first vercel.app URL out of the CLI output", () => {
    assert.equal(
      deploymentUrl("▲ Aliased https://human-last-dashboard.vercel.app\n[52s] done"),
      "https://human-last-dashboard.vercel.app",
    );
    assert.equal(deploymentUrl("no url here"), null);
  });
});
