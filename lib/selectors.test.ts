import assert from "node:assert/strict";
import { test } from "node:test";

import { dataset as demoDataset } from "../data/demo/dataset";
import { POLARITY_ORDER, TIER_ORDER, createSelectors } from "./selectors";

/**
 * Selectors are the only read path the pages use, so their invariants matter:
 * lookups resolve by id, the current assessment is the newest version, and
 * recent activity is ordered by date.
 */

const {
  assessmentHistory,
  claimsForEvidence,
  currentAssessment,
  evidenceForCapability,
  recentActivity,
  sourceOf,
  sourcesById,
} = createSelectors(demoDataset);

test("selectors are built from the dataset they are given, not from a fixed import", () => {
  const trimmed = structuredClone(demoDataset);
  trimmed.assessments = trimmed.assessments.filter((a) => a.capability_id !== "cap-l1");
  trimmed.sources = trimmed.sources.filter((s) => s.id !== "s-01");

  const custom = createSelectors(trimmed);
  assert.equal(custom.currentAssessment("cap-l1"), null);
  assert.equal(custom.sourcesById.get("s-01"), undefined);
  assert.throws(() => custom.sourceOf({ source_id: "s-01" }), /Dangling source reference: s-01/);

  // The default instance is unaffected by a second one.
  assert.ok(currentAssessment("cap-l1"));
  assert.ok(sourcesById.get("s-01"));
});

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

// ------------------------------------------------------------------ chart data

test("evidenceByCapability draws one unit per linked record, grouped by direction", () => {
  const rows = createSelectors(demoDataset).evidenceByCapability();
  assert.equal(rows.length, demoDataset.capabilities.length);

  for (const row of rows) {
    const linked = evidenceForCapability(row.capability.id);
    assert.equal(row.items.length, linked.length, `${row.capability.id}: unit count`);
    assert.deepEqual(
      new Set(row.items.map((i) => i.id)),
      new Set(linked.map((e) => e.id)),
      `${row.capability.id}: same records`,
    );

    const ranks = row.items.map((i) => POLARITY_ORDER.indexOf(i.polarity));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${row.capability.id}: ordered`);

    const counted = POLARITY_ORDER.reduce((sum, p) => sum + row.counts[p], 0);
    assert.equal(counted, row.items.length, `${row.capability.id}: counts match units`);
  }
});

test("a record linked to two capabilities is drawn in both rows but counted once in the mix", () => {
  const custom = structuredClone(demoDataset);
  const shared = custom.evidence[0];
  const [a, b] = custom.capabilities;
  shared.capability_ids = [a.id, b.id];

  const selectors = createSelectors(custom);
  const rows = selectors.evidenceByCapability();
  const inRow = (id: string) => rows.find((r) => r.capability.id === id)?.items.map((i) => i.id) ?? [];
  assert.ok(inRow(a.id).includes(shared.id));
  assert.ok(inRow(b.id).includes(shared.id));

  const mix = selectors.evidenceMix();
  assert.equal(mix.units.filter((u) => u.id === shared.id).length, 1);
  assert.equal(mix.total, custom.evidence.length);
});

test("evidenceMix counts every record once and reports review state without inventing acceptance", () => {
  const mix = createSelectors(demoDataset).evidenceMix();
  assert.equal(mix.total, demoDataset.evidence.length);
  assert.equal(
    POLARITY_ORDER.reduce((sum, p) => sum + mix.polarity[p], 0),
    mix.total,
  );
  assert.equal(
    Object.values(mix.review).reduce((sum, n) => sum + n, 0),
    mix.total,
  );
  assert.equal(
    mix.largestGroup,
    Math.max(...POLARITY_ORDER.map((p) => mix.polarity[p])),
  );

  const custom = structuredClone(demoDataset);
  for (const e of custom.evidence) e.review_status = "unreviewed";
  assert.equal(createSelectors(custom).evidenceMix().review.accepted, 0);

  custom.evidence[0].review_status = "accepted";
  const after = createSelectors(custom).evidenceMix();
  assert.equal(after.review.accepted, 1);
  assert.equal(after.review.unreviewed, custom.evidence.length - 1);
});

test("evidenceMix on an empty dataset has no largest group instead of NaN", () => {
  const custom = structuredClone(demoDataset);
  custom.evidence = [];
  const mix = createSelectors(custom).evidenceMix();
  assert.equal(mix.total, 0);
  assert.equal(mix.largestGroup, 0);
});

test("sourceBase splits sources by tier and keeps developer affiliation separate", () => {
  const base = createSelectors(demoDataset).sourceBase();
  assert.equal(base.total, demoDataset.sources.length);
  assert.deepEqual(
    base.tiers.map((t) => t.tier),
    [...TIER_ORDER],
  );
  assert.equal(
    base.tiers.reduce((sum, t) => sum + t.units.length, 0),
    base.total,
  );
  assert.equal(
    base.independentTier,
    demoDataset.sources.filter((s) => s.source_tier === "independent").length,
  );
  assert.equal(
    base.developerAffiliated,
    demoDataset.sources.filter((s) => s.developer_affiliated).length,
  );

  for (const { units } of base.tiers) {
    const flags = units.map((u) => Number(u.developerAffiliated));
    assert.deepEqual(flags, [...flags].sort((a, b) => a - b), "independent of developer first");
  }
});
