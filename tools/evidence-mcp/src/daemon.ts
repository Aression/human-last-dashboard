#!/usr/bin/env node
/**
 * Background daemon: runs discovery and the quality audit on a cron schedule.
 *
 * It is a plain long-lived Node process with its own scheduler, so it works the
 * same on this workstation, in a container, or under any supervisor:
 *
 *   npm run evidence:daemon            # run in the foreground
 *   npm run evidence:daemon -- --once discovery   # one task, then exit
 *   npm run evidence:daemon -- --status           # print daemon state, exit
 *
 * Windows task registration is in scripts/install-evidence-daemon-task.ps1.
 *
 * Guarantees:
 * - one run per task at a time (`single-flight`), enforced by the store locks too;
 * - every run is appended to .evidence-mcp/runs/index.jsonl with ok/failure;
 * - heartbeat + schedule state in .evidence-mcp/state/daemon.json, so status is
 *   observable without the process' stdout;
 * - shutdown on SIGINT/SIGTERM finishes the run in flight, then exits.
 */
import { appendFile } from "node:fs/promises";
import path from "node:path";

import { describeCron, nextRun, parseCron, type CronSpec } from "./schedule";
import { loadConfig } from "./config";
import { runDiscovery } from "./discovery";
import { runQuality } from "./quality";
import { renderQualityReport } from "./report";
import {
  appendJsonl,
  dateStamp,
  ensureStore,
  newRunId,
  storePaths,
  writeJson,
  type StorePaths,
} from "./store";
import type { RunRecord, ScheduleEntry, ToolConfig } from "./contracts";

type TaskName = "discovery" | "quality";

interface ScheduledTask {
  entry: ScheduleEntry;
  spec: CronSpec;
  next: Date;
  running: boolean;
  lastRun: string | null;
  lastStatus: string | null;
}

interface DaemonState {
  pid: number;
  running: boolean;
  started_at: string;
  heartbeat_at: string;
  store: string;
  mode: "scheduler" | "once";
  tasks: Array<{
    task: TaskName;
    cron: string;
    next_run_at: string | null;
    last_run_at: string | null;
    last_status: string | null;
  }>;
}

const HEARTBEAT_MS = 15_000;
const TICK_MS = 20_000;

function log(message: string, paths?: StorePaths): void {
  const line = `${new Date().toISOString()} ${message}`;
  process.stdout.write(`${line}\n`);
  if (paths) {
    void appendFile(path.join(paths.logs, `daemon-${dateStamp()}.log`), `${line}\n`, "utf8").catch(() => {
      // Logging must never take the daemon down.
    });
  }
}

async function writeState(paths: StorePaths, state: DaemonState): Promise<void> {
  await writeJson(path.join(paths.state, "daemon.json"), state);
}

function buildState(pid: number, mode: DaemonState["mode"], tasks: ScheduledTask[], paths: StorePaths, startedAt: string): DaemonState {
  return {
    pid,
    running: mode === "scheduler",
    started_at: startedAt,
    heartbeat_at: new Date().toISOString(),
    store: paths.home,
    mode,
    tasks: tasks.map((t) => ({
      task: t.entry.task,
      cron: describeCron(t.entry.cron),
      next_run_at: t.next.toISOString(),
      last_run_at: t.lastRun,
      last_status: t.lastStatus,
    })),
  };
}

async function runTask(task: TaskName, config: ToolConfig, paths: StorePaths): Promise<RunRecord> {
  const started = new Date();
  const runId = newRunId(task, started);
  let record: RunRecord;
  try {
    if (task === "discovery") {
      const outcome = await runDiscovery({});
      record = {
        run_id: outcome.run_id,
        task: "discovery",
        started_at: outcome.started_at,
        finished_at: outcome.finished_at,
        ok: outcome.totals.adapter_failures === 0 || outcome.totals.candidates > 0,
        summary: `${outcome.totals.candidates} candidates, ${outcome.totals.duplicates} duplicates, ${outcome.totals.adapter_failures} adapter failures`,
        counts: {
          candidates: outcome.totals.candidates,
          duplicates: outcome.totals.duplicates,
          skipped_existing: outcome.totals.skipped_existing,
          adapter_failures: outcome.totals.adapter_failures,
        },
      };
      // runDiscovery stores its own outcome file; the shared run index is ours.
      await appendJsonl(path.join(paths.runs, "index.jsonl"), record);
    } else {
      const outcome = await runQuality({});
      const markdown = renderQualityReport(outcome);
      await writeJson(path.join(paths.reports, `${outcome.run_id}.json`), outcome);
      await appendFile(path.join(paths.reports, `${outcome.run_id}.md`), `${markdown}\n`, "utf8");
      record = {
        run_id: outcome.run_id,
        task: "quality",
        started_at: outcome.started_at,
        finished_at: outcome.finished_at,
        ok: outcome.counts.error === 0,
        summary: `${outcome.counts.total} findings (${outcome.counts.error} error, ${outcome.counts.warn} warn)`,
        counts: { total: outcome.counts.total, error: outcome.counts.error, warn: outcome.counts.warn, info: outcome.counts.info },
      };
      // runQuality already appended its own run record; the report files are ours.
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record = {
      run_id: runId,
      task,
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
      ok: false,
      summary: `${task} run failed`,
      error: message,
    };
    await appendJsonl(path.join(paths.runs, "index.jsonl"), record);
    log(`task ${task} failed: ${message}`, paths);
  }
  log(`task ${task} ${record.ok ? "ok" : "FAILED"}: ${record.summary}`, paths);
  return record;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const onceIndex = argv.indexOf("--once");
  const onceTask = onceIndex >= 0 ? (argv[onceIndex + 1] as TaskName | undefined) : undefined;
  const statusOnly = argv.includes("--status");

  const paths = storePaths();
  await ensureStore(paths);
  const config = await loadConfig();

  if (statusOnly) {
    const state = await import("./store").then((s) => s.readJson<DaemonState>(path.join(paths.state, "daemon.json")));
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }

  const tasks: ScheduledTask[] = config.schedule
    .filter((entry) => entry.enabled)
    .map((entry) => {
      const spec = parseCron(entry.cron);
      return { entry, spec, next: nextRun(spec), running: false, lastRun: null, lastStatus: null };
    });

  if (onceTask) {
    log(`single run: ${onceTask}`, paths);
    const record = await runTask(onceTask, config, paths);
    process.exitCode = record.ok ? 0 : 1;
    return;
  }

  if (tasks.length === 0) {
    log("no enabled schedule entries in the config; nothing to do", paths);
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date().toISOString();
  let stopping = false;
  let state = buildState(process.pid, "scheduler", tasks, paths, startedAt);
  await writeState(paths, state);
  log(`daemon started (pid ${process.pid}), ${tasks.length} scheduled tasks: ${tasks.map((t) => `${t.entry.task}@${t.entry.cron}`).join(", ")}`, paths);

  let lastHeartbeat = Date.now();
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`received ${signal}; finishing in-flight work and exiting`, paths);
    state = { ...buildState(process.pid, "once", tasks, paths, startedAt), running: false };
    await writeState(paths, state);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  while (!stopping) {
    const now = new Date();
    for (const task of tasks) {
      if (task.running || task.next.getTime() > now.getTime()) continue;
      task.running = true;
      void (async () => {
        const record = await runTask(task.entry.task, config, paths);
        task.lastRun = record.finished_at;
        task.lastStatus = record.ok ? "ok" : "failed";
        task.next = nextRun(task.spec, new Date());
        task.running = false;
      })();
    }

    if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
      lastHeartbeat = Date.now();
      state = buildState(process.pid, "scheduler", tasks, paths, startedAt);
      await writeState(paths, state);
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}

main().catch((error) => {
  process.stderr.write(`daemon fatal: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
