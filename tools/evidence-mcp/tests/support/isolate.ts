/**
 * Test isolation, imported before anything that touches the store.
 *
 * tools/evidence-mcp/src/store.ts resolves its root from `EVIDENCE_MCP_ROOT` at
 * call time, but tests must never point the engine at the repository's real
 * `.evidence-mcp/`. This module runs on first import and pins the root to a
 * throwaway directory, so `import "../src/quality"` further down the file can
 * never write into the checkout.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

if (!process.env.EVIDENCE_MCP_ROOT) {
  process.env.EVIDENCE_MCP_ROOT = mkdtempSync(path.join(tmpdir(), "evidence-mcp-test-"));
}

export const testRoot = process.env.EVIDENCE_MCP_ROOT;
