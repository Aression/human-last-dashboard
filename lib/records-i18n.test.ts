import assert from "node:assert/strict";
import test from "node:test";

import { dataset } from "../data/demo/dataset";
import {
  localizeDataset,
  overlaySummary,
  validateOverlay,
} from "./records-i18n";
import type { Dataset } from "./types";

/** The committed dataset the app renders (loaded through the seam). */
async function published(): Promise<Dataset> {
  const { loadDataset } = await import("./data");
  return loadDataset();
}

test("the committed translation overlay matches the published dataset", async () => {
  const problems = validateOverlay(await published());
  assert.deepEqual(problems, []);
});

test("the demo fixture is not what gets published", async () => {
  const publishedDataset = await published();
  assert.notEqual(publishedDataset.label, dataset.label);
  assert.ok(
    publishedDataset.sources.every((s) => s.provenance === "curated"),
    "every published source must be curated",
  );
});

test("every overlay section translates at least one record", () => {
  const summary = overlaySummary();
  assert.equal(summary.length, 8);
  for (const entry of summary) {
    assert.ok(entry.translated > 0, `${entry.section} has no translations`);
  }
});

test("English returns the dataset unchanged, by reference", async () => {
  const publishedDataset = await published();
  assert.equal(localizeDataset(publishedDataset, "en"), publishedDataset);
});

test("Chinese translates authored prose but never a quotation", async () => {
  const publishedDataset = await published();
  const localized = localizeDataset(publishedDataset, "zh");

  const claim = localized.claims.find((c) => c.id === "c-aide2-loop");
  const original = publishedDataset.claims.find((c) => c.id === "c-aide2-loop");
  assert.ok(claim && original);

  assert.notEqual(claim.statement, original.statement);
  assert.match(claim.statement, /[\u4e00-\u9fff]/, "statement is Chinese");
  assert.equal(
    claim.source_span,
    original.source_span,
    "a quotation is never translated",
  );
});

test("localizing does not mutate the dataset it was given", async () => {
  const publishedDataset = await published();
  const before = publishedDataset.claims.find((c) => c.id === "c-aide2-loop")!.statement;
  localizeDataset(publishedDataset, "zh");
  const after = publishedDataset.claims.find((c) => c.id === "c-aide2-loop")!.statement;
  assert.equal(after, before);
});

test("records keep their ids and references under localization", async () => {
  const publishedDataset = await published();
  const localized = localizeDataset(publishedDataset, "zh");

  assert.deepEqual(
    localized.sources.map((s) => s.id),
    publishedDataset.sources.map((s) => s.id),
  );
  assert.deepEqual(
    localized.evidence.map((e) => e.source_id),
    publishedDataset.evidence.map((e) => e.source_id),
  );
  assert.deepEqual(
    localized.capabilities.map((c) => c.id),
    publishedDataset.capabilities.map((c) => c.id),
  );
});

test("an overlay entry whose record disappeared is reported", () => {
  const empty = {
    sources: [],
    claims: [],
    evidence: [],
    assessments: [],
    events: [],
    attributions: [],
    forecasts: [],
    questions: [],
  } as unknown as Dataset;

  const problems = validateOverlay(empty);
  assert.ok(problems.length > 0);
  assert.ok(
    problems.every((p) => p.includes("has no such record")),
    `unexpected problem shape: ${problems[0]}`,
  );
});
