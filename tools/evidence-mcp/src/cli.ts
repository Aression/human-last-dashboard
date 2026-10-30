#!/usr/bin/env node
/**
 * Command-line front end over the same dispatch the MCP server uses, for scheduled
 * tasks, CI, and manual inspection.
 *
 *   node --import tsx tools/evidence-mcp/src/cli.ts status
 *   node --import tsx tools/evidence-mcp/src/cli.ts discover --dry-run
 *   node --import tsx tools/evidence-mcp/src/cli.ts audit --rule dataset-valid
 *   node --import tsx tools/evidence-mcp/src/cli.ts report
 *   node --import tsx tools/evidence-mcp/src/cli.ts validate
 *
 * `--json` prints the structured payload instead of the summary block.
 */
import { dispatchTool, toolDefinitions, type Args } from "./tools";

function parseArgs(argv: string[]): { command: string; flags: Args; json: boolean } {
  const [command = "help", ...rest] = argv;
  const flags: Args = {};
  let json = false;
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--json") {
      json = true;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-/g, "_");
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    if (key === "limit") flags[key] = Number(next);
    else if (key === "query_ids" || key === "adapters" || key === "rules") {
      flags[key] = next.split(",").map((v) => v.trim()).filter(Boolean);
    } else flags[key] = next;
    i += 1;
  }
  return { command, flags, json };
}

const USAGE = `usage: cli.ts <command> [options]

commands:
  status                     daemon + store status
  queries                    configured discovery queries
  discover [--dry-run] [--query_ids a,b] [--adapters arxiv,github,rss] [--limit n]
  candidates [--status new] [--limit n]
  candidate <candidate_id>
  triage <candidate_id> --decision accept-for-review|reject|duplicate --reason "..."
  audit [--rules a,b] [--limit n] [--dry-run]
  findings [--severity error] [--rule id] [--limit n]
  report [--run_id id] [--max_findings n]
  validate                   validate the dashboard dataset
  runs [--task discovery] [--limit n]
  tools                      list tool names

All commands accept --json.`;

async function main(): Promise<void> {
  const { command, flags, json } = parseArgs(process.argv.slice(2));
  const positional = process.argv.slice(3).filter((a) => !a.startsWith("--"));

  const call = async (tool: string, args: Args = {}) => {
    const result = await dispatchTool(tool, args);
    process.stdout.write(`${json ? JSON.stringify(result.data, null, 2) : result.summary}\n`);
    return result;
  };

  switch (command) {
    case "status":
      await call("automation_status");
      return;
    case "queries":
      await call("discovery_queries");
      return;
    case "discover":
      await call("discovery_run", flags);
      return;
    case "candidates":
      await call("discovery_candidates", flags);
      return;
    case "candidate":
      await call("discovery_candidate", { candidate_id: positional[0] ?? flags.candidate_id });
      return;
    case "triage":
      await call("discovery_triage", {
        candidate_id: positional[0] ?? flags.candidate_id,
        decision: flags.decision,
        reason: flags.reason,
      });
      return;
    case "audit":
      await call("quality_audit", flags);
      return;
    case "findings":
      await call("quality_findings", flags);
      return;
    case "report": {
      const result = await dispatchTool("quality_report", flags);
      const data = result.data as { markdown: string | null };
      process.stdout.write(`${data.markdown ?? "no audit stored yet"}\n`);
      return;
    }
    case "validate":
      await call("dataset_validate");
      return;
    case "runs":
      await call("runs_history", flags);
      return;
    case "tools":
      for (const tool of toolDefinitions()) {
        process.stdout.write(`${tool.name.padEnd(22)} ${tool.mutating ? "writes" : "read  "}  ${tool.title}\n`);
      }
      return;
    default:
      process.stdout.write(`${USAGE}\n`);
      process.exitCode = command === "help" ? 0 : 1;
  }
}

main().catch((error) => {
  process.stderr.write(`cli error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
