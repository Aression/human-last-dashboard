import { CAPABILITIES, TAXONOMY_VERSION } from "../data/capabilities";
import curatedRecords from "../data/curated/records.json";
import { loadAutomationSnapshot } from "../lib/automation";
import type { Dataset } from "../lib/types";
import { validateDataset } from "../lib/validate";

/**
 * CLI wrapper around lib/validate.ts, wired into `npm run build` so a broken
 * dataset fails the build instead of rendering an inconsistent dashboard.
 *
 * Input 1 is the committed curated records file, composed with the taxonomy from
 * data/capabilities.ts exactly the way lib/data/index.ts composes it. The file
 * deliberately does not import lib/data: that module validates at import time and
 * throws, which would hide the readable violation list this script exists to
 * print. Input 2 is the automation snapshot rendered on /automation.
 *
 * Prints one line per input; prints every violation and exits 1 otherwise.
 */

const published = curatedRecords as unknown as Omit<Dataset, "capabilities">;
const dataset: Dataset = { ...published, capabilities: CAPABILITIES };

const violations = validateDataset(dataset, { expectedProvenance: "curated" });
if (dataset.taxonomy_version !== TAXONOMY_VERSION) {
  violations.unshift(
    `dataset taxonomy_version is ${JSON.stringify(
      dataset.taxonomy_version,
    )}, but data/capabilities.ts is on ${JSON.stringify(TAXONOMY_VERSION)}`,
  );
}

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

let failed = false;

if (violations.length > 0) {
  console.error(`Curated records FAILED with ${violations.length} violation(s):`);
  for (const violation of violations) console.error(` - ${violation}`);
  failed = true;
} else {
  console.log(`Curated records: ${dataset.label} (taxonomy ${dataset.taxonomy_version})`);
  const width = Math.max(...counts.map(([name]) => name.length));
  for (const [name, count] of counts) {
    console.log(`  ${name.padEnd(width)}  ${count}`);
  }
  console.log(
    `Curated records OK: ${counts.reduce((sum, [, count]) => sum + count, 0)} records across ${counts.length} collections, no violations.`,
  );
}

// The automation snapshot is rendered verbatim on /automation, so it is data too:
// a stale or hand-edited file must fail the build rather than ship a broken page.
let snapshot: ReturnType<typeof loadAutomationSnapshot> | null = null;
try {
  snapshot = loadAutomationSnapshot();
  console.log(
    `Automation snapshot OK: ${snapshot.candidates.total} lead(s) stored, ${snapshot.candidates.items.length} published as rows, newest audit ${
      snapshot.audit?.run_id ?? "none"
    }.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  failed = true;
}

if (failed) process.exit(1);
