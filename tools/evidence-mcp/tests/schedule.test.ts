import assert from "node:assert/strict";
import { test } from "node:test";

import { cronMatches, nextRun, parseCron } from "../src/schedule";

test("parses wildcards, ranges, steps and lists", () => {
  const spec = parseCron("*/15 9-17 * * 1-5");
  assert.deepEqual([...spec.minutes].sort((a, b) => a - b), [0, 15, 30, 45]);
  assert.deepEqual([...spec.hours].sort((a, b) => a - b), [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.equal(spec.daysOfMonth.size, 31);
  assert.deepEqual([...spec.daysOfWeek].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.equal(spec.domRestricted, false);
  assert.equal(spec.dowRestricted, true);

  const listSpec = parseCron("5,35 2 1,15 * *");
  assert.deepEqual([...listSpec.minutes].sort((a, b) => a - b), [5, 35]);
  assert.deepEqual([...listSpec.daysOfMonth].sort((a, b) => a - b), [1, 15]);
});

test("rejects malformed expressions instead of guessing", () => {
  assert.throws(() => parseCron("* * * *"), /five fields/);
  assert.throws(() => parseCron("60 * * * *"), /outside 0-59/);
  assert.throws(() => parseCron("* 24 * * *"), /outside 0-23/);
  assert.throws(() => parseCron("* * * 13 *"), /outside 1-12/);
  assert.throws(() => parseCron("*/0 * * * *"), /bad step/);
  assert.throws(() => parseCron("5-1 * * * *"), /outside/);
});

test("normalises Sunday: 0 and 7 are the same day", () => {
  const fromSeven = parseCron("0 2 * * 7");
  const fromZero = parseCron("0 2 * * 0");
  assert.deepEqual([...fromSeven.daysOfWeek], [...fromZero.daysOfWeek]);
  assert.deepEqual([...fromZero.daysOfWeek], [0]);
});

test("matches a concrete local timestamp", () => {
  const spec = parseCron("17 */6 * * *");
  const hit = new Date(2026, 2, 4, 12, 17, 0, 0);
  const miss = new Date(2026, 2, 4, 12, 18, 0, 0);
  assert.equal(cronMatches(spec, hit), true);
  assert.equal(cronMatches(spec, miss), false);
});

test("nextRun returns the following matching minute, never the current one", () => {
  const spec = parseCron("17 */6 * * *");
  const at = new Date(2026, 2, 4, 12, 17, 0, 0);
  const next = nextRun(spec, at);
  assert.equal(next.getTime(), new Date(2026, 2, 4, 18, 17, 0, 0).getTime());

  const later = nextRun(spec, new Date(2026, 2, 4, 12, 18, 0, 0));
  assert.equal(later.getTime(), new Date(2026, 2, 4, 18, 17, 0, 0).getTime());
});

test("nextRun rolls into the next day and the next month", () => {
  const daily = parseCron("42 3 * * *");
  const nextDay = nextRun(daily, new Date(2026, 2, 4, 4, 0, 0, 0));
  assert.equal(nextDay.getTime(), new Date(2026, 2, 5, 3, 42, 0, 0).getTime());

  const monthly = parseCron("0 0 1 * *");
  const nextMonth = nextRun(monthly, new Date(2026, 2, 4, 12, 0, 0, 0));
  assert.equal(nextMonth.getTime(), new Date(2026, 3, 1, 0, 0, 0, 0).getTime());
});

test("restricted day-of-month and day-of-week apply OR semantics", () => {
  const spec = parseCron("0 0 1 * 1"); // the 1st, or any Monday
  const monday = nextRun(spec, new Date(2026, 2, 4, 12, 0, 0, 0));
  assert.equal(monday.getDay(), 1);
  const first = nextRun(spec, new Date(2026, 2, 31, 12, 0, 0, 0));
  assert.equal(first.getDate(), 1);
});
