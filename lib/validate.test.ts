import assert from "node:assert/strict";
import { test } from "node:test";

import { dataset as demoDataset } from "./demo-data";
import type { Dataset } from "./types";
import { assertValidDataset, validateDataset } from "./validate";

/**
 * lib/validate.ts must catch the integrity failures the demo data happens not to
 * have, without rejecting the real dataset. Each case below injects exactly one
 * class of corruption into a clone of the demo dataset.
 */

const clone = (): Dataset => structuredClone(demoDataset);

function violationsFor(mutate: (ds: Dataset) => void): string[] {
  const ds = clone();
  mutate(ds);
  return validateDataset(ds);
}

function expectViolation(violations: string[], pattern: RegExp): void {
  assert.ok(
    violations.some((v) => pattern.test(v)),
    `expected a violation matching ${pattern}, got ${JSON.stringify(violations, null, 2)}`,
  );
}

test("the real demo dataset has no violations", () => {
  assert.deepEqual(validateDataset(clone()), []);
  assert.doesNotThrow(() => assertValidDataset(clone()));
});

test("a dangling foreign key is reported", () => {
  const violations = violationsFor((ds) => {
    ds.claims[0].source_id = "s-404";
  });
  expectViolation(violations, /claim c-01: source_id references unknown id "s-404"/);
});

test("a duplicate id is reported", () => {
  const violations = violationsFor((ds) => {
    ds.claims[1].id = ds.claims[0].id;
  });
  expectViolation(violations, /claim c-01: duplicate id/);
});

test("a broken assessment version chain is reported", () => {
  const violations = violationsFor((ds) => {
    const v2 = ds.assessments.find((a) => a.id === "a-l1-v2");
    assert.ok(v2);
    v2.supersedes_assessment_id = null;
  });
  expectViolation(violations, /assessment a-l1-v2: version 2 must supersede version 1/);
  expectViolation(violations, /capability cap-l1: expected exactly one current assessment/);
});

test("an assessment may not supersede a version from another capability", () => {
  const violations = violationsFor((ds) => {
    const v2 = ds.assessments.find((a) => a.id === "a-l1-v2");
    assert.ok(v2);
    v2.supersedes_assessment_id = "a-l2-v1";
  });
  expectViolation(
    violations,
    /assessment a-l1-v2: supersedes a-l2-v1, which belongs to capability cap-l2/,
  );
});

test("an invalid forecast is reported", () => {
  const resolvedWithoutNotes = violationsFor((ds) => {
    const open = ds.forecasts.find((f) => f.id === "f-03");
    assert.ok(open);
    open.status = "resolved-true";
  });
  expectViolation(resolvedWithoutNotes, /forecast f-03: status resolved-true requires resolved_at/);
  expectViolation(resolvedWithoutNotes, /forecast f-03: status resolved-true requires resolution_notes/);

  const badProbability = violationsFor((ds) => {
    ds.forecasts[0].probability = 1.5;
  });
  expectViolation(
    badProbability,
    /forecast f-01: probability must be null or a number between 0 and 1/,
  );

  const openWithResolution = violationsFor((ds) => {
    ds.forecasts[2].resolved_at = "2027-02-01";
  });
  expectViolation(openWithResolution, /forecast f-03: an open forecast must not have resolved_at/);
});

test("demo provenance may not claim observed artifacts", () => {
  const violations = violationsFor((ds) => {
    ds.sources[0].canonical_url = "https://example.invalid/report";
    ds.sources[0].content_hash = "sha256:deadbeef";
  });
  expectViolation(violations, /source s-01: demo provenance must not claim an observed canonical_url/);
  expectViolation(violations, /source s-01: demo provenance must not claim an observed content_hash/);
});

test("violations aggregate and assertValidDataset throws one message with all of them", () => {
  const ds = clone();
  ds.claims[0].source_id = "s-404";
  ds.evidence[0].claim_ids = ["c-404"];
  ds.forecasts[0].probability = -1;

  const violations = validateDataset(ds);
  assert.ok(violations.length >= 3, `expected at least 3 violations, got ${violations.length}`);
  assert.throws(
    () => assertValidDataset(ds),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Dataset validation failed with \d+ violation\(s\)/);
      assert.match(error.message, /s-404/);
      assert.match(error.message, /c-404/);
      return true;
    },
  );
});
