#!/usr/bin/env node
/**
 * MCP stdio server for the evidence automation tool.
 *
 * Transport is deliberately thin: `tools.ts` owns the tool list, argument schemas
 * and dispatch, so the same behaviour is reachable from tests, the CLI and the
 * background daemon. This file only speaks MCP.
 *
 * Run: node --import tsx tools/evidence-mcp/src/server.ts
 * DSH registration: see docs/automation.md.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { SERVER_NAME, SERVER_VERSION, dispatchTool, listToolsForMcp } from "./tools";

export const INSTRUCTIONS = `This server finds and audits research leads for the Human's Last Dashboard.

What it produces:
- Discovery candidates: pointers to real pages found in real feeds/APIs, each with
  provenance=discovered and source_tier=lead, plus whatever retrieval facts were
  actually observed (HTTP status, sha256 of the fetched bytes, timestamp).
- Quality findings: problems in the dashboard dataset and the discovery store, each
  with a severity and a remediation.

What it cannot do (by design):
- It cannot add a source, claim, evidence record or assessment to the dashboard.
  Triage changes a candidate's status only. Promoting a lead into the dataset needs a
  reviewed edit to lib/demo-data.ts (or a future database), citing the stored record.
- It cannot assert that a claim is true. A discovered page stating something is a
  lead, never evidence; a hash proves bytes were fetched, not that they are correct.

When reporting results to a human, keep those distinctions explicit and never
present a candidate as verified evidence.`;

/** Builds the MCP server without binding a transport, so tests can attach one. */
export function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listToolsForMcp() }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    try {
      const result = await dispatchTool(name, args);
      return {
        content: [
          { type: "text" as const, text: result.summary },
          { type: "text" as const, text: JSON.stringify(result.data, null, 2) },
        ],
        structuredContent: result.data as Record<string, unknown>,
        isError: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `${name} failed: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only: stdout carries the protocol.
  process.stderr.write(`[${SERVER_NAME}] v${SERVER_VERSION} ready on stdio\n`);
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("tools/evidence-mcp/src/server.ts");
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`[${SERVER_NAME}] fatal: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}
