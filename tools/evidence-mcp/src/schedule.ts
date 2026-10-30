/**
 * Minimal five-field cron support, written by hand so the tool needs no scheduler
 * dependency.
 *
 * Fields: minute hour day-of-month month day-of-week.
 * Supports `*`, `a`, `a-b`, `*​/n`, `a-b/n`, and comma lists. Day-of-week accepts
 * 0-7 (0 and 7 are both Sunday). Standard cron OR-semantics apply when both
 * day-of-month and day-of-week are restricted.
 *
 * Times are interpreted in the daemon's local timezone, which is what a
 * workstation-scheduled background job should honour.
 */

export interface CronSpec {
  source: string;
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  /** True when the field was `*` (or an equivalent full-range list). */
  domRestricted: boolean;
  dowRestricted: boolean;
}

const FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 7 },
] as const;

export function parseCron(expr: string): CronSpec {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`cron "${expr}" must have exactly five fields, got ${parts.length}`);
  }
  const sets = parts.map((part, i) => parseField(part, FIELDS[i], expr));
  const dow = new Set<number>();
  for (const value of sets[4]) dow.add(value === 7 ? 0 : value);
  return {
    source: expr.trim(),
    minutes: sets[0],
    hours: sets[1],
    daysOfMonth: sets[2],
    months: sets[3],
    daysOfWeek: dow,
    domRestricted: parts[2] !== "*",
    dowRestricted: parts[4] !== "*",
  };
}

function parseField(part: string, field: (typeof FIELDS)[number], expr: string): Set<number> {
  const out = new Set<number>();
  for (const piece of part.split(",")) {
    if (piece.length === 0) throw new Error(`cron "${expr}": empty list item in ${field.name}`);
    const [rangePart, stepPart] = piece.split("/");
    let step = 1;
    if (stepPart !== undefined) {
      step = Number(stepPart);
      if (!Number.isInteger(step) || step < 1) {
        throw new Error(`cron "${expr}": bad step "${stepPart}" in ${field.name}`);
      }
    }
    let start: number;
    let end: number;
    if (rangePart === "*") {
      start = field.min;
      end = field.max;
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-");
      start = Number(a);
      end = Number(b);
    } else {
      start = Number(rangePart);
      end = stepPart === undefined ? start : field.max;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error(`cron "${expr}": non-numeric range "${rangePart}" in ${field.name}`);
    }
    if (start < field.min || end > field.max || start > end) {
      throw new Error(
        `cron "${expr}": ${field.name} range ${start}-${end} outside ${field.min}-${field.max}`,
      );
    }
    for (let v = start; v <= end; v += step) out.add(v);
  }
  return out;
}

/** True when `at` (local time) satisfies every field. */
export function cronMatches(spec: CronSpec, at: Date): boolean {
  if (!spec.minutes.has(at.getMinutes())) return false;
  if (!spec.hours.has(at.getHours())) return false;
  if (!spec.months.has(at.getMonth() + 1)) return false;
  const domOk = spec.daysOfMonth.has(at.getDate());
  const dowOk = spec.daysOfWeek.has(at.getDay());
  // Classic cron: two restricted day fields mean "either", one means "that one".
  if (spec.domRestricted && spec.dowRestricted) return domOk || dowOk;
  if (spec.domRestricted) return domOk;
  if (spec.dowRestricted) return dowOk;
  return true;
}

/**
 * Next matching local time strictly after `from`. Scans day by day (bounded), then
 * the matching hours of that day, so it stays cheap for sparse schedules.
 */
export function nextRun(spec: CronSpec, from: Date = new Date(), horizonDays = 400): Date {
  const start = new Date(from.getTime() + 60_000 - (from.getSeconds() * 1000 + from.getMilliseconds()));
  const cursor = new Date(start.getTime());
  for (let day = 0; day < horizonDays; day += 1) {
    const candidateDay = new Date(cursor.getTime());
    candidateDay.setDate(candidateDay.getDate() + day);
    if (!spec.months.has(candidateDay.getMonth() + 1)) continue;
    const domOk = spec.daysOfMonth.has(candidateDay.getDate());
    const dowOk = spec.daysOfWeek.has(candidateDay.getDay());
    const dayOk =
      spec.domRestricted && spec.dowRestricted ? domOk || dowOk : spec.domRestricted ? domOk : spec.dowRestricted ? dowOk : true;
    if (!dayOk) continue;
    for (const hour of [...spec.hours].sort((a, b) => a - b)) {
      for (const minute of [...spec.minutes].sort((a, b) => a - b)) {
        const when = new Date(candidateDay.getTime());
        when.setHours(hour, minute, 0, 0);
        if (when.getTime() > from.getTime()) return when;
      }
    }
  }
  throw new Error(`cron "${spec.source}": no matching time within ${horizonDays} days`);
}

/** Human-readable summary used in status output. */
export function describeCron(expr: string): string {
  const spec = parseCron(expr);
  return spec.source;
}
