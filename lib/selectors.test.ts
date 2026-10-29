import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessmentHistory,
  claimsForEvidence,
  currentAssessment,
  evidenceForCapability,
  recentActivity,
  sourceOf,
  sourcesById,
} from "./selectors";

/**
 * Selectors are the only read path the pages use, so their invariants matter:
 * lookups resolve by id, the current assessment is the newest version, and
 * recent activity is ordered by date.
 */

test("id lookups resolve the demo records", () => {
  const source = sourcesById.get("s-01");
  assert.ok(source, "expected source s-01 to exist");
  assert.equal(source.publisher, "Fictional Lab A");
  assert.equal(sourceOf({ source_id: "s-01" }), source);
});

test("sourceOf throws on a dangling reference instead of returning undefined", () => {
  assert.throws(
    () => sourceOf({ source_id: "s-404" }),
    /Dangling source reference: s-404/,
  );
});

test("currentAssessment returns the newest version per capability", () => {
  const l1 = currentAssessment("cap-l1");
  assert.ok(l1, "expected cap-l1 to have an assessment");
  assert.equal(l1.version, 2);
  assert.equal(l1.id, "a-l1-v2");
  assert.equal(l1.status, "demonstrated-under-conditions");
  assert.equal(currentAssessment("cap-l0"), null);
});

test("assessmentHistory is ordered newest first and only covers one capability", () => {
  const history = assessmentHistory("cap-l1");
  assert.deepEqual(
    history.map((a) => a.version),
    [2, 1],
  );
  assert.deepEqual(
    history.map((a) => a.id),
    ["a-l1-v2", "a-l1-v1"],
  );
  assert.ok(history.every((a) => a.capability_id === "cap-l1"));
});

test("evidenceForCapability only returns evidence linked to that capability", () => {
  const linked = evidenceForCapability("cap-l1");
  assert.deepEqual(
    linked.map((e) => e.id),
    ["e-01", "e-02", "e-03"],
  );
  assert.ok(linked.every((e) => e.capability_ids.includes("cap-l1")));
  assert.deepEqual(evidenceForCapability("cap-l5"), []);
});

test("claimsForEvidence resolves linked claims and drops unknown claim ids", () => {
  const evidence = evidenceForCapability("cap-l1")[0];
  assert.ok(evidence);
  assert.deepEqual(
    claimsForEvidence(evidence).map((c) => c.id),
    ["c-01"],
  );
  assert.deepEqual(claimsForEvidence({ ...evidence, claim_ids: ["c-404"] }), []);
});

test("recentActivity is ordered newest first, spans events/assessments/forecasts, and respects the limit", () => {
  const items = recentActivity();
  assert.equal(items.length, 8);
  for (let i = 1; i < items.length; i += 1) {
    assert.ok(
      items[i - 1].date >= items[i].date,
      `recentActivity not sorted: ${items[i - 1].date} then ${items[i].date}`,
    );
  }

  const kinds = new Set(items.map((i) => i.kind));
  assert.ok(kinds.has("event"), "expected events in recent activity");
  assert.ok(kinds.has("assessment"), "expected assessment revisions in recent activity");
  assert.ok(kinds.has("forecast"), "expected resolved forecasts in recent activity");

  // The newest record in the demo dataset is the resolved forecast f-02.
  assert.equal(items[0].kind, "forecast");
  assert.equal(items[0].date, "2026-10-16");
  assert.match(items[0].title, /f-02/);

  const revision = items.find((i) => i.kind === "assessment" && i.title.includes("v2"));
  assert.ok(revision, "expected an assessment revision entry");
  assert.match(revision.title, /assessment revised to v2/);
  assert.match(revision.detail, /→/);

  assert.equal(recentActivity(3).length, 3);
  assert.equal(recentActivity(0).length, 0);
});
