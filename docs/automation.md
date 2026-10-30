# Evidence automation

Two jobs that were manual before: **finding candidate sources** and **checking the dataset for bookkeeping problems**. Both run here as one local MCP server, `tools/evidence-mcp/`, that a local agent (DeepSeek Harness, model `deepseek-v4.1-flash`) drives through MCP tools, and that can also run unattended on a cron schedule.

This document describes what the tool actually does, what it refuses to do, and how to check it. It does not describe an ingestion pipeline: nothing here writes to `data/`.

## 1. What it can and cannot do

It **can**:

- fetch configured feeds and APIs (arXiv, the GitHub search API, RSS/Atom), store what it found as *candidates*, and de-duplicate them across runs;
- record retrieval facts for each candidate: `retrieved_at`, `http_status`, `content_hash`, `bytes`, `content_type`;
- triage a candidate's status (`accept-for-review`, `reject`, `duplicate`) with a required reason;
- audit the dashboard dataset and the candidate store against ten rules and write a Markdown report;
- run both jobs on a cron schedule from a background daemon.

It **cannot**, by construction:

- add a source, claim, evidence record, assessment, or forecast to the dashboard. A candidate is stored with `provenance: "discovered"` and `source_tier: "lead"`; promoting it into `data/` is a reviewed edit to `data/demo/dataset.ts` (or a future curated store) citing the stored record;
- assert that a page's content is true. A `content_hash` proves which bytes were fetched, not that they are correct, and no tool marks a claim as verified;
- run a model. There is no LLM call anywhere in `tools/evidence-mcp/`; the agent is the reader, the tool is the retriever and the checker. This is deliberate — see AGENTS.md rules 2–4 and 10;
- rewrite the dataset. The audit reports findings with a remediation sentence; applying one is a separate, reviewed edit.

## 2. Store layout

Everything lives in `.evidence-mcp/` at the repository root (git-ignored):

| Path | Contents |
| --- | --- |
| `candidates/<YYYY-MM-DD>/<candidate-id>.json` | One fetched candidate, with its retrieval facts. |
| `quality/<run-id>.json` | Full audit outcome (findings, checks, timings). |
| `reports/<run-id>.json` and `.md` | Audit findings plus the rendered Markdown report. |
| `runs/index.jsonl` | Append-only run log, one line per run with `ok` and a summary. |
| `runs/discovery/<run-id>.json` | Per-query detail for a discovery run. |
| `state/daemon.json` | Daemon pid, heartbeat, and next run times. |
| `state/*.lock` | Single-flight locks, reclaimed if stale after 30 minutes. |
| `logs/daemon-<date>.log` | Daemon log. |

Set `EVIDENCE_MCP_ROOT` to point the tools at a different store (the tests use this to avoid touching the real one), and `EVIDENCE_MCP_CONFIG` to use a different config file.

## 3. Configuration

`tools/evidence-mcp/config/discovery.json` holds the queries, the schedule, and the audit thresholds. It is validated on load: a wrong version, an unknown adapter, a non-cron schedule field, or an unusable threshold fails with the offending key named instead of being ignored.

Four queries ship today:

| Query id | Adapters | Intent |
| --- | --- | --- |
| `q-self-improvement-repos` | github | Repositories that claim recursive self-improvement or self-modifying agent work. |
| `q-agent-benchmarks` | github, rss | New agent benchmarks and capability reports. |
| `q-papers-self-improvement` | arxiv | Papers on self-improving models and automated research loops. |
| `q-governance-signals` | rss | Public statements and evaluations about capability thresholds. |

GitHub query keywords are **ANDed**, so each GitHub query carries one quoted phrase (`"recursive self-improvement" in:name,description`). A query with several unquoted terms measured `total_count: 0` and could never return a lead.

## 4. The eleven MCP tools

| Tool | Mutates | What it does |
| --- | --- | --- |
| `discovery_queries` | — | List the configured queries, adapters, and feeds. |
| `discovery_run` | yes | Fetch every adapters for the selected queries and store new candidates. `dry_run` fetches and reports without writing. |
| `discovery_candidates` | — | List stored candidates, newest first, filterable by status and query. |
| `discovery_candidate` | — | Read one candidate including its retrieval evidence. |
| `discovery_triage` | yes | Record `accept-for-review`, `reject`, or `duplicate` with a required reason. Changes candidate status only. |
| `quality_audit` | yes | Run the audit rules; `dry_run` reports without storing a run. |
| `quality_findings` | — | Findings from the most recent stored audit. |
| `quality_report` | — | The most recent audit rendered as Markdown. |
| `dataset_validate` | — | Run `lib/validate.ts` (with demo provenance, like the build) and build the selectors over the shipped dataset. |
| `automation_status` | — | Daemon liveness, schedule, store counts, configured adapters. |
| `runs_history` | — | The run index, newest first. |

Every tool declares `readOnlyHint` for the non-mutating set, and every mutating tool says so in its description. The server sends these instructions to the client so the agent sees the boundary before the first call.

## 5. The audit rules

| Rule | Severity | Flags |
| --- | --- | --- |
| `dataset-valid` | error | Any violation from `lib/validate.ts`, including the taxonomy-version rule. |
| `dataset-selectors` | error | A reference the dashboard's selectors would throw on. |
| `candidate-stale` | info | A candidate older than `candidate_max_age_days` that is still untriaged. |
| `candidate-untriaged` | warn | A candidate untouched for 14 days. |
| `candidate-suspect-url` | warn | A candidate whose stored URL is not fetchable under the deny-list. |
| `candidate-duplicate-hash` | warn | Two candidates with the same `content_hash`. |
| `evidence-unreviewed` | warn | Evidence pending review longer than `unreviewed_evidence_days`. |
| `forecast-overdue` | warn | An open forecast past its resolution date. |
| `source-integrity` | error | A stored source URL answers non-2xx, or its content changed. Bounded by `integrity_batch`. |
| `provenance-gaps` | warn | Evidence with no claim and no capability link, or a record missing stored provenance. |

The report distinguishes three outcomes per rule: **yes** (inspected and clean), **no** (findings), and **skipped** (nothing to inspect). A skipped check is not a pass, and the report says so — `source-integrity` is skipped today because the demo sources store no `canonical_url`.

## 6. Running it

```bash
npm run evidence:run -- status              # store counts, daemon state
npm run evidence:run -- discover --json     # one discovery run
npm run evidence:run -- audit               # one audit
npm run evidence:run -- report              # Markdown report of the last audit
npm run evidence:run -- triage cand-2026-ab12cd34 accept-for-review "relevant to L5 proposals"
```

Scheduled runs:

```powershell
pwsh -File scripts\evidence-daemon-start.ps1     # detach the daemon, confirm a heartbeat
pwsh -File scripts\evidence-daemon-status.ps1    # pid liveness, schedule, next runs
pwsh -File scripts\evidence-daemon-stop.ps1      # stop it
pwsh -File scripts\install-evidence-daemon-task.ps1   # start it at logon (Windows Task Scheduler)
```

`npm run evidence:daemon` runs the scheduler in the foreground; `-- --once quality` runs one task and exits. `scripts\evidence-daemon-run.ps1` refuses to start a second scheduler while a live daemon holds the state file, so the logon task and a manual start cannot both fire every job.

The shipped schedule is `17 */6 * * *` for discovery and `42 3 * * *` for the audit, in local time. The daemon writes a heartbeat every 15 seconds and ticks every 20; a task that is already running is never started twice, and the store locks enforce the same rule across processes.

`scripts\evidence-daemon-start.ps1` creates the process through `Win32_Process.Create` rather than `Start-Process`. With `Start-Process`, the detached daemon kept the caller's output pipe open for its entire life, so anything capturing the script's output blocked until the daemon exited — measured here as a start script that never returned while the daemon itself was healthy.

## 7. Registering it in DeepSeek Harness

The plugin entry lives in `cordis.patch.yml` of the active DSH profile (here `C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml`):

```yaml
- insert:
    - id: mcp-evidence-automation
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: evidence_automation
        transport: stdio
        command: node
        args: [ "--import", "tsx", "tools/evidence-mcp/src/server.ts" ]
        cwd: 'D:\dev\human-last-dashboard'
        env:
          EVIDENCE_MCP_ROOT: 'D:\dev\human-last-dashboard'
        toolCallTimeoutMs: 180000
        failOnStartupError: false
```

After a DSH restart the tools appear as `mcp__evidence_automation__*`. `failOnStartupError: false` keeps a broken bridge from taking the session down; the tools then simply are not listed.

## 8. Verifying it

```bash
npm test                                   # includes tools/evidence-mcp/tests/**
npm run evidence:run -- discover           # prints "run <id>: N candidates, ... "
npm run evidence:run -- audit              # prints per-rule pass/fail/skip and inspected counts
pwsh -File scripts\evidence-daemon-status.ps1
```

What was measured when this was added, on this workstation:

- `npm test` → 110 tests, 0 failures (the MCP suite covers cron parsing, the config parser, URL deny-listing, argument validation, the store layout, the adapters against recorded fixtures, the rules, the report, and the MCP protocol over an in-memory transport).
- `npm run evidence:run -- discover` → `24 candidates, 0 duplicates, 14 already stored, 0 adapter failures`; 47 candidates in the store.
- `npm run evidence:run -- audit` → `0 finding(s); 10/10 rule check(s) ok; 277 subject(s) inspected; skipped (nothing to inspect): source-integrity`.
- A daemon started with `scripts\evidence-daemon-start.ps1` returns in under two seconds, survives the launching shell, and reports `process: running` with a live heartbeat; a one-minute test cron fired a scheduled audit exactly one tick after start and wrote its run record, report, and state.
- The MCP server answered a real SDK client over stdio with 11 tools and `server: {"name":"evidence-automation","version":"0.1.0"}`.

## 9. Limits

- **The demo dataset stays demo.** Nothing here promotes a candidate; every promotion is a reviewed edit.
- **No snapshots.** A candidate stores a content hash and a bounded summary, not the page body. A page can change after retrieval; the hash says what was seen, not what is there now.
- **Network-dependent, and filtered.** Adapters only cover hosts reachable from this workstation. Hugging Face, OpenAI, Anthropic, and Hacker News timed out here, so no adapter targets them: a broken adapter would report coverage this tool does not have.
- **Not durable.** The scheduler is a local process with a state file, not a queue. A run interrupted by shutdown is reported as a failed run, not resumed.
- **`source-integrity` needs curated URLs.** It is skipped until the dataset stores real `canonical_url` values.
