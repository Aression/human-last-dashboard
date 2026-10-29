import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { CAPABILITIES, TAXONOMY_VERSION } from "./capabilities";

/**
 * Assessments pin TAXONOMY_VERSION, so a change to the capability definitions
 * must be a deliberate, versioned act. This test fails on any edit to a level,
 * criterion, non-criterion, or bottleneck until both the version and the hash
 * below are updated together.
 *
 * It detects accidental edits, not malicious ones: anyone who can change the
 * definitions can also change the hash. Review of the diff is the real control.
 */
const EXPECTED_HASH = "f3b1c58577524c6f9d830e658211f4f8174ff5e78238fb8e23e344c35ea16424";

test("capability definitions match the pinned taxonomy version", () => {
  const actual = createHash("sha256").update(JSON.stringify(CAPABILITIES)).digest("hex");
  assert.equal(
    actual,
    EXPECTED_HASH,
    `Capability definitions changed. If this is intended: bump TAXONOMY_VERSION (currently "${TAXONOMY_VERSION}") in data/capabilities.ts, set EXPECTED_HASH to ${actual}, and re-assess every current assessment under the new version.`,
  );
});

test("every criterion id is unique across the taxonomy", () => {
  const ids = CAPABILITIES.flatMap((c) => c.criteria.map((k) => k.id));
  assert.equal(new Set(ids).size, ids.length);
});
