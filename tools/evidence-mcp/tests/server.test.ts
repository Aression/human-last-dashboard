/**
 * Protocol-level test: drive the real MCP server through a linked transport pair.
 *
 * This proves the tools are reachable the way DSH will reach them (initialize →
 * tools/list → tools/call), without spawning a process, so it stays reliable in CI.
 * `discovery_run` and `quality_audit` are exercised in dry_run mode only, so no
 * candidate or run file is written by the suite.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../src/server";
import { validateArgs } from "../src/tools";

let client: Client;
let server: ReturnType<typeof createServer>;
let tempRoot: string;
let previousRoot: string | undefined;

before(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "hld-mcp-test-"));
  previousRoot = process.env.EVIDENCE_MCP_ROOT;
  process.env.EVIDENCE_MCP_ROOT = tempRoot;

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  server = createServer();
  client = new Client({ name: "hld-mcp-test", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

after(async () => {
  await client.close();
  await server.close();
  if (previousRoot === undefined) delete process.env.EVIDENCE_MCP_ROOT;
  else process.env.EVIDENCE_MCP_ROOT = previousRoot;
  await rm(tempRoot, { recursive: true, force: true });
});

test("server advertises its instruction text and the full tool list", async () => {
  const instructions = client.getInstructions();
  assert.match(instructions ?? "", /cannot add a source/);
  assert.match(instructions ?? "", /provenance=discovered/);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "automation_status",
    "dataset_validate",
    "discovery_candidate",
    "discovery_candidates",
    "discovery_queries",
    "discovery_run",
    "discovery_triage",
    "quality_audit",
    "quality_findings",
    "quality_report",
    "runs_history",
  ]);

  const mutating = tools.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name).sort();
  assert.deepEqual(mutating, ["discovery_run", "discovery_triage", "quality_audit"]);

  for (const tool of tools) {
    assert.ok(tool.description && tool.description.length > 40, `${tool.name} needs a real description`);
    assert.equal((tool.inputSchema as { type?: string }).type, "object");
  }
});

test("dataset_validate reports the shipped demo dataset as valid", async () => {
  const result = await client.callTool({ name: "dataset_validate", arguments: {} });
  assert.equal(result.isError, false);
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  assert.match(text, /dataset valid/);
  const payload = JSON.parse((result.content as Array<{ type: string; text: string }>)[1].text) as {
    violations: string[];
    selector_error: string | null;
    ok: boolean;
  };
  assert.deepEqual(payload.violations, []);
  assert.equal(payload.selector_error, null);
  assert.equal(payload.ok, true);
});

test("discovery_queries exposes intent and adapters, and refuses unknown arguments", async () => {
  const result = await client.callTool({ name: "discovery_queries", arguments: {} });
  assert.equal(result.isError, false);
  const payload = JSON.parse((result.content as Array<{ type: string; text: string }>)[1].text) as {
    queries: Array<{ id: string; intent: string; adapters: string[] }>;
  };
  assert.ok(payload.queries.length >= 3);
  for (const query of payload.queries) assert.ok(query.intent.length > 10);

  const bad = await client.callTool({ name: "discovery_queries", arguments: { nope: 1 } });
  assert.equal(bad.isError, true);
  assert.match((bad.content as Array<{ type: string; text: string }>)[0].text, /unknown argument "nope"/);
});

test("dry runs store nothing and say so", async () => {
  const audit = await client.callTool({ name: "quality_audit", arguments: { dry_run: true, rules: ["dataset-valid"] } });
  assert.equal(audit.isError, false);
  const auditText = (audit.content as Array<{ type: string; text: string }>)[0].text;
  assert.match(auditText, /finding/);

  const runs = await client.callTool({ name: "runs_history", arguments: {} });
  const runsPayload = JSON.parse((runs.content as Array<{ type: string; text: string }>)[1].text) as { runs: unknown[] };
  assert.equal(runsPayload.runs.length, 0, "a dry run must not append to the run index");
});

test("report and findings tools work before any audit exists", async () => {
  const findings = await client.callTool({ name: "quality_findings", arguments: {} });
  const findingsPayload = JSON.parse((findings.content as Array<{ type: string; text: string }>)[1].text) as {
    run_id: string | null;
  };
  assert.equal(findingsPayload.run_id, null);

  const report = await client.callTool({ name: "quality_report", arguments: {} });
  const reportPayload = JSON.parse((report.content as Array<{ type: string; text: string }>)[1].text) as {
    markdown: string | null;
  };
  assert.equal(reportPayload.markdown, null);
});

test("unknown tools produce an MCP error result, not a crash", async () => {
  const result = await client.callTool({ name: "does_not_exist", arguments: {} });
  assert.equal(result.isError, true);
  assert.match((result.content as Array<{ type: string; text: string }>)[0].text, /unknown tool/);
});

test("every advertised schema accepts its own required arguments", async () => {
  const { tools } = await client.listTools();
  for (const tool of tools) {
    const required = ((tool.inputSchema as { required?: string[] }).required ?? []);
    const args: Record<string, unknown> = {};
    for (const key of required) {
      const prop = (tool.inputSchema as { properties: Record<string, { enum?: unknown[]; type?: string }> }).properties[key];
      args[key] = prop.enum ? prop.enum[0] : prop.type === "integer" ? 1 : "x-valid-value";
    }
    const checked = validateArgs(tool.inputSchema as Record<string, unknown>, args);
    assert.equal(checked.ok, true, `${tool.name} schema rejected its own minimal args: ${JSON.stringify(checked)}`);
  }
});
