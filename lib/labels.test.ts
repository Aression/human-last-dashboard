import assert from "node:assert/strict";
import test from "node:test";

import { formatDate } from "./labels";

test("a date-only dataset field formats as a calendar date", () => {
  assert.equal(formatDate("2026-03-01"), "1 Mar 2026");
});

test("a full timestamp formats instead of rendering Invalid Date", () => {
  assert.equal(formatDate("2026-11-04T10:18:07.957Z"), "4 Nov 2026");
});

test("a missing or unparseable value is reported, not rendered raw", () => {
  assert.equal(formatDate(null), "unknown");
  assert.equal(formatDate(""), "unknown");
  assert.equal(formatDate("not-a-date"), "unknown");
});
