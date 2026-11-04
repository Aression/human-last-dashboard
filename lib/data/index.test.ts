/**
 * Loader test: the committed dataset is the only data the dashboard renders.
 *
 * These assertions are the contract between the curation pipeline and the app:
 * the records file composes with the single-sourced taxonomy, validates as
 * curated (never demo), and every source carries what makes a record evidence -
 * a canonical URL, a retrieval time and a hash of the fetched bytes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CAPABILITIES, TAXONOMY_VERSION } from "../../data/capabilities";
import type { Dataset, Source } from "../types";
import { loadDataset } from "./index";

/** Questions are the one collection without created_at, so provenance is what we read. */
type ProvenancedRecord = { id: string; provenance: string };

function recordsOf(ds: Dataset): Array<[string, ProvenancedRecord[]]> {
  return [
    ["source", ds.sources],
    ["claim", ds.claims],
    ["evidence", ds.evidence],
    ["assessment", ds.assessments],
    ["proposal", ds.proposals],
    ["event", ds.events],
    ["attribution", ds.attributions],
    ["forecast", ds.forecasts],
    ["question", ds.questions],
  ];
}

test("the committed dataset composes and shares the single-sourced taxonomy", () => {
  const ds = loadDataset();

  assert.equal(ds.taxonomy_version, TAXONOMY_VERSION);
  // The records file has no capabilities key; the list is the one from data/capabilities.ts.
  assert.deepEqual(ds.capabilities, CAPABILITIES);
});

test("every record in the committed dataset is curated, not demo", () => {
  const ds = loadDataset();
  let count = 0;

  for (const [kind, records] of recordsOf(ds)) {
    for (const record of records) {
      assert.equal(record.provenance, "curated", `${kind} ${record.id} provenance`);
      count += 1;
    }
  }

  assert.ok(count > 0, "the committed dataset should hold at least one curated record");
});

test("every source names an observed page: canonical_url, retrieved_at, content_hash", () => {
  const ds = loadDataset();
  assert.ok(ds.sources.length > 0, "curated data must include at least one source");

  for (const source of ds.sources) {
    assertSource(source);
  }
});

function assertSource(source: Source): void {
  const id = source.id;
  assert.match(source.canonical_url ?? "", /^https?:\/\/\S+$/, `source ${id} needs a canonical_url`);
  assert.ok(
    typeof source.retrieved_at === "string" && !Number.isNaN(Date.parse(source.retrieved_at)),
    `source ${id} needs an ISO retrieved_at`,
  );
  assert.match(source.content_hash ?? "", /^[a-f0-9]{32,}$/i, `source ${id} needs a content_hash`);
}
