import { dataset } from "../data/demo/dataset";
import { validateDataset } from "../lib/validate";

/**
 * CLI wrapper around lib/validate.ts, wired into `npm run build` so a broken
 * dataset fails the build instead of rendering an inconsistent dashboard.
 *
 * Prints "OK" plus record counts on success; prints every violation and exits 1
 * otherwise.
 */

// The demo fixture may only hold demo records; curated records live in data/curated/.
const violations = validateDataset(dataset, { expectedProvenance: "demo" });

const counts: Array<[string, number]> = [
  ["sources", dataset.sources.length],
  ["claims", dataset.claims.length],
  ["evidence", dataset.evidence.length],
  ["capabilities", dataset.capabilities.length],
  ["assessments", dataset.assessments.length],
  ["proposals", dataset.proposals.length],
  ["events", dataset.events.length],
  ["attributions", dataset.attributions.length],
  ["forecasts", dataset.forecasts.length],
  ["questions", dataset.questions.length],
];

if (violations.length > 0) {
  console.error(`Dataset validation FAILED with ${violations.length} violation(s):`);
  for (const violation of violations) console.error(` - ${violation}`);
  process.exit(1);
}

console.log(`Dataset: ${dataset.label}`);
const width = Math.max(...counts.map(([name]) => name.length));
for (const [name, count] of counts) {
  console.log(`  ${name.padEnd(width)}  ${count}`);
}
console.log(
  `Dataset OK: ${counts.reduce((sum, [, count]) => sum + count, 0)} records across ${counts.length} collections, no violations.`,
);
