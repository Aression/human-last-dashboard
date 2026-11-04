import assert from "node:assert/strict";
import { test } from "node:test";

import rawSnapshot from "../data/automation/snapshot.json";
import {
  loadAutomationSnapshot,
  skippedChecks,
  statusCount,
  validateAutomationSnapshot,
  type AutomationSnapshot,
} from "./automation";

function clone(): AutomationSnapshot {
  return JSON.parse(JSON.stringify(rawSnapshot)) as AutomationSnapshot;
}

test("the committed snapshot is internally consistent", () => {
  assert.deepEqual(validateAutomationSnapshot(rawSnapshot), []);
});

test("a schema version other than 1 is rejected", () => {
  const broken = clone() as unknown as { schema_version: number };
  broken.schema_version = 2;
  const errors = validateAutomationSnapshot(broken);
  assert.ok(
    errors.some((error) => error.includes("schema_version")),
    `expected a schema_version error, got ${JSON.stringify(errors)}`,
  );
});

test("status counts that do not add up to the total are rejected", () => {
  const broken = clone();
  broken.candidates.by_status = { new: broken.candidates.total - 1 };
  const errors = validateAutomationSnapshot(broken);
  assert.ok(errors.some((error) => error.includes("by_status sums to")));
});

test("a lead whose url is not http(s) is rejected", () => {
  const broken = clone();
  broken.candidates.items[0].url = "ftp://example.com/paper";
  const errors = validateAutomationSnapshot(broken);
  assert.ok(errors.some((error) => error.includes("url must be http(s)")));
});

test("a duplicated lead id is rejected", () => {
  const broken = clone();
  broken.candidates.items[1].id = broken.candidates.items[0].id;
  const errors = validateAutomationSnapshot(broken);
  assert.ok(errors.some((error) => error.includes("duplicated")));
});

test("by_day counts that do not add up to the total are rejected", () => {
  const broken = clone();
  broken.candidates.by_day = broken.candidates.by_day.map((day, index) =>
    index === 0 ? { ...day, count: day.count + 5 } : day,
  );
  const errors = validateAutomationSnapshot(broken);
  assert.ok(errors.some((error) => error.includes("by_day sums to")));
});

test("the loader returns the published rows, newest first, never more than the total", () => {
  const snapshot = loadAutomationSnapshot();
  const items = snapshot.candidates.items;
  assert.ok(items.length > 0);
  assert.ok(items.length <= snapshot.candidates.total);
  const dates = items.map((item) => Date.parse(item.created_at));
  const sorted = [...dates].sort((a, b) => b - a);
  assert.deepEqual(dates, sorted);
});

test("every published lead is a lead: discovered, unreviewed, with an http(s) url", () => {
  for (const lead of loadAutomationSnapshot().candidates.items) {
    assert.match(lead.url, /^https?:\/\//);
    assert.equal(lead.status, "new", `${lead.id} should still be awaiting triage`);
    assert.ok(lead.adapter.length > 0);
    assert.ok(lead.query_id.length > 0);
  }
});

test("statusCount reads the aggregate rather than recomputing a subset", () => {
  const snapshot = loadAutomationSnapshot();
  const newCount = statusCount(snapshot, "new");
  assert.equal(newCount, snapshot.candidates.by_status.new ?? 0);
  assert.ok(newCount <= snapshot.candidates.total);
});

test("skippedChecks only returns rules that inspected nothing", () => {
  const snapshot = loadAutomationSnapshot();
  const skipped = skippedChecks(snapshot.audit);
  for (const check of skipped) assert.equal(check.inspected, 0);
  const total = snapshot.audit?.checks.length ?? 0;
  assert.equal(skipped.length + (snapshot.audit?.checks ?? []).filter((c) => c.inspected > 0).length, total);
});
