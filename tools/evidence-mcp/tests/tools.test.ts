import assert from "node:assert/strict";
import { test } from "node:test";

import { isFetchableUrl, parseConfig } from "../src/config";
import { validateArgs } from "../src/tools";

const BASE_QUERY = {
  id: "q-test",
  title: "Test query",
  intent: "Exercise the config parser without touching the network.",
  adapters: ["github"],
  keywords: ["self-improvement"],
  capability_ids: ["cap-l4"],
  limit: 3,
};

const BASE_CONFIG = {
  version: 1,
  userAgent: "human-last-dashboard-evidence-mcp/test",
  request_timeout_ms: 15000,
  max_items_per_query: 5,
  queries: [BASE_QUERY],
  schedule: [{ task: "discovery", cron: "17 */6 * * *", enabled: true }],
  quality: {
    candidate_max_age_days: 30,
    unreviewed_evidence_days: 120,
    source_recheck_days: 14,
    integrity_batch: 5,
    deny_hosts: ["localhost", "169.254.169.254"],
  },
};

test("accepts a complete config and clamps per-query limits to the global cap", () => {
  const config = parseConfig({ ...BASE_CONFIG, queries: [{ ...BASE_QUERY, limit: 50 }] });
  assert.equal(config.queries[0].limit, 5);
  assert.equal(config.schedule.length, 1);
  assert.equal(config.quality.integrity_batch, 5);
});

test("rejects configs that would silently disable parts of the tool", () => {
  assert.throws(() => parseConfig({ ...BASE_CONFIG, version: 2 }), /unsupported config version/);
  assert.throws(() => parseConfig({ ...BASE_CONFIG, queries: [] }), /non-empty array/);
  assert.throws(
    () => parseConfig({ ...BASE_CONFIG, queries: [BASE_QUERY, BASE_QUERY] }),
    /duplicate query id "q-test"/,
  );
  assert.throws(
    () => parseConfig({ ...BASE_CONFIG, queries: [{ ...BASE_QUERY, adapters: ["huggingface"] }] }),
    /unknown adapter "huggingface"/,
  );
  assert.throws(
    () => parseConfig({ ...BASE_CONFIG, queries: [{ ...BASE_QUERY, adapters: ["rss"] }] }),
    /needs at least one feed URL/,
  );
  assert.throws(
    () => parseConfig({ ...BASE_CONFIG, queries: [{ ...BASE_QUERY, intent: "short" }] }),
    /intent must explain/,
  );
  assert.throws(() => parseConfig({ ...BASE_CONFIG, schedule: [{ task: "cleanup", cron: "* * * * *" }] }), /task must be/);
  assert.throws(() => parseConfig({ ...BASE_CONFIG, schedule: [{ task: "discovery", cron: "* * * *" }] }), /five fields/);
  assert.throws(
    () => parseConfig({ ...BASE_CONFIG, quality: { ...BASE_CONFIG.quality, deny_hosts: [] } }),
    /deny_hosts/,
  );
});

test("blocks loopback, link-local and non-http URLs before any fetch", () => {
  const deny = BASE_CONFIG.quality.deny_hosts;
  assert.equal(isFetchableUrl("https://api.github.com/repos/x/y", deny), true);
  assert.equal(isFetchableUrl("http://127.0.0.1:8000/status", deny), false);
  assert.equal(isFetchableUrl("http://localhost/admin", deny), false);
  assert.equal(isFetchableUrl("http://169.254.169.254/latest/meta-data", deny), false);
  assert.equal(isFetchableUrl("http://192.168.1.10/router", deny), false);
  assert.equal(isFetchableUrl("file:///C:/Windows/win.ini", deny), false);
  assert.equal(isFetchableUrl("not a url", deny), false);
});

const STRING_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 3 },
    mode: { type: "string", enum: ["a", "b"] },
    count: { type: "integer" },
    tags: { type: "array", items: { type: "string", enum: ["x", "y"] } },
  },
  required: ["name"],
  additionalProperties: false,
};

test("validateArgs rejects missing, unknown, mistyped and out-of-enum arguments", () => {
  assert.equal(validateArgs(STRING_SCHEMA, { name: "abc" }).ok, true);
  assert.deepEqual(validateArgs(STRING_SCHEMA, {}), { ok: false, error: 'missing required argument "name"' });
  assert.deepEqual(validateArgs(STRING_SCHEMA, { name: "abc", extra: 1 }), {
    ok: false,
    error: 'unknown argument "extra"',
  });
  assert.equal(validateArgs(STRING_SCHEMA, { name: 3 }).ok, false);
  assert.equal(validateArgs(STRING_SCHEMA, { name: "abc", mode: "c" }).ok, false);
  assert.equal(validateArgs(STRING_SCHEMA, { name: "abc", count: 1.5 }).ok, false);
  assert.equal(validateArgs(STRING_SCHEMA, { name: "ab" }).ok, false);
  assert.equal(validateArgs(STRING_SCHEMA, { name: "abc", tags: ["x", "z"] }).ok, false);
  assert.equal(validateArgs(STRING_SCHEMA, { name: "abc", tags: ["x", "y"] }).ok, true);
});
