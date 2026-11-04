import assert from "node:assert/strict";
import test from "node:test";

import { CAPABILITIES } from "../data/capabilities";
import {
  localizeDataset,
  validateCapabilityOverlay,
  validateOverlay,
  type CapabilityOverlayFile,
} from "./records-i18n";
import type { Dataset } from "./types";

const CJK = /[\u4e00-\u9fff]/;

/** A dataset whose only populated collection is the capability taxonomy. */
function capabilitiesOnly(
  capabilities: Dataset["capabilities"] = CAPABILITIES,
): Dataset {
  return {
    label: "capabilities-i18n fixture",
    taxonomy_version: "taxonomy-1",
    sources: [],
    claims: [],
    evidence: [],
    capabilities,
    assessments: [],
    proposals: [],
    events: [],
    attributions: [],
    forecasts: [],
    questions: [],
  };
}

/** The committed dataset the app renders (loaded through the seam). */
async function published(): Promise<Dataset> {
  const { loadDataset } = await import("./data");
  return loadDataset();
}

test("the committed capability overlay matches the published taxonomy", async () => {
  assert.deepEqual(validateCapabilityOverlay(await published()), []);
  assert.deepEqual(validateOverlay(await published()), []);
});

test("every capability has a Chinese name and description", async () => {
  const localized = localizeDataset(await published(), "zh");
  const english = await published();

  assert.equal(localized.capabilities.length, english.capabilities.length);

  for (const [index, capability] of english.capabilities.entries()) {
    const zh = localized.capabilities[index];
    assert.equal(zh.id, capability.id, "ids are never translated");
    assert.equal(zh.level, capability.level, "level markers stay L0-L7");

    assert.match(zh.name, CJK, `${capability.id} name is Chinese`);
    assert.notEqual(zh.name, capability.name, `${capability.id} name is translated`);
    assert.match(zh.description, CJK, `${capability.id} description is Chinese`);
    assert.notEqual(
      zh.description,
      capability.description,
      `${capability.id} description is translated`,
    );
  }
});

test("every criterion text is translated and keeps its id and order", async () => {
  const localized = localizeDataset(await published(), "zh");
  const english = await published();

  for (const [index, capability] of english.capabilities.entries()) {
    const zh = localized.capabilities[index];

    assert.deepEqual(
      zh.criteria.map((c) => c.id),
      capability.criteria.map((c) => c.id),
      `${capability.id} criteria keep their ids and order`,
    );

    for (const [criterionIndex, criterion] of capability.criteria.entries()) {
      const translated = zh.criteria[criterionIndex];
      assert.match(translated.text, CJK, `${criterion.id} text is Chinese`);
      assert.notEqual(
        translated.text,
        criterion.text,
        `${criterion.id} text is translated`,
      );
    }
  }
});

test("non-criteria keep their count and are translated", async () => {
  const localized = localizeDataset(await published(), "zh");
  const english = await published();

  for (const [index, capability] of english.capabilities.entries()) {
    const zh = localized.capabilities[index];

    assert.equal(
      zh.nonCriteria.length,
      capability.nonCriteria.length,
      `${capability.id} nonCriteria is order-matched`,
    );
    for (const [i, text] of capability.nonCriteria.entries()) {
      assert.match(zh.nonCriteria[i], CJK, `${capability.id} nonCriteria[${i}] is Chinese`);
      assert.notEqual(zh.nonCriteria[i], text);
    }
  }
});

test("known bottlenecks keep their count and are translated", async () => {
  const localized = localizeDataset(await published(), "zh");
  const english = await published();

  for (const [index, capability] of english.capabilities.entries()) {
    const zh = localized.capabilities[index];

    assert.equal(
      zh.knownBottlenecks.length,
      capability.knownBottlenecks.length,
      `${capability.id} knownBottlenecks is order-matched`,
    );
    for (const [i, text] of capability.knownBottlenecks.entries()) {
      assert.match(zh.knownBottlenecks[i], CJK, `${capability.id} knownBottlenecks[${i}] is Chinese`);
      assert.notEqual(zh.knownBottlenecks[i], text);
    }
  }
});

test("a knownBottlenecks array of the wrong length is a violation", () => {
  const dataset = capabilitiesOnly([
    {
      id: "cap-x",
      level: "L0",
      name: "Example capability",
      description: "An example description.",
      criteria: [{ id: "crit-x-1", text: "An example criterion." }],
      nonCriteria: [],
      knownBottlenecks: ["One bottleneck.", "Another bottleneck."],
    },
  ]);
  const overlay: CapabilityOverlayFile = {
    locale: "zh",
    capabilities: {
      "cap-x": {
        name: "示例能力",
        description: "一段示例描述。",
        nonCriteria: [],
        knownBottlenecks: ["只剩一条。"],
      },
    },
    criteria: { "crit-x-1": { text: "一条示例标准。" } },
  };

  const problems = validateCapabilityOverlay(dataset, overlay);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /capabilities\.cap-x\.knownBottlenecks has 1 entries but the capability has 2/);
});

test("localizing capabilities does not mutate the dataset it was given", () => {
  const dataset = capabilitiesOnly();
  const before = structuredClone(dataset.capabilities);
  localizeDataset(dataset, "zh");
  assert.deepEqual(dataset.capabilities, before);
});

test("the Chinese selector set carries the translated capability name", async () => {
  const { selectorsFor } = await import("./data");
  const zh = selectorsFor("zh");
  const capability = zh.capabilitiesById.get("cap-l3");

  assert.ok(capability, "cap-l3 exists in the localized selector set");
  assert.match(capability.name, CJK, "the zh selector set holds the Chinese name");
  assert.notEqual(
    capability.name,
    selectorsFor("en").capabilitiesById.get("cap-l3")?.name,
  );
});

/**
 * The overlay API is exercised with a hand-built overlay: a broken *committed*
 * file would fail the build at module load, so violations are provoked here.
 */
function fixture(): { dataset: Dataset; overlay: CapabilityOverlayFile } {
  const dataset = capabilitiesOnly([
    {
      id: "cap-x",
      level: "L0",
      name: "Example capability",
      description: "An example description.",
      criteria: [{ id: "crit-x-1", text: "An example criterion." }],
      nonCriteria: ["A first non-criterion.", "A second non-criterion."],
      knownBottlenecks: [],
    },
  ]);

  const overlay: CapabilityOverlayFile = {
    note: "fixture",
    locale: "zh",
    capabilities: {
      "cap-x": {
        name: "示例能力",
        description: "一段示例描述。",
        nonCriteria: ["第一条非标准。", "第二条非标准。"],
      },
    },
    criteria: { "crit-x-1": { text: "一条示例标准。" } },
  };

  return { dataset, overlay };
}

test("a valid overlay produces no violations", () => {
  const { dataset, overlay } = fixture();
  assert.deepEqual(validateCapabilityOverlay(dataset, overlay), []);
});

test("a nonCriteria array of the wrong length is a violation", () => {
  const { dataset, overlay } = fixture();
  overlay.capabilities!["cap-x"]!.nonCriteria = ["只剩一条。"];

  const problems = validateCapabilityOverlay(dataset, overlay);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /capabilities\.cap-x\.nonCriteria has 1 entries but the capability has 2/);
});

test("an unknown capability id is a violation", () => {
  const { dataset, overlay } = fixture();
  overlay.capabilities!["cap-z"] = { name: "不存在", description: "不存在。", nonCriteria: [] };

  const problems = validateCapabilityOverlay(dataset, overlay);
  assert.ok(
    problems.some((p) => p.includes("capabilities.cap-z has no such record")),
    problems.join("\n"),
  );
});

test("an unknown criterion id is a violation", () => {
  const { dataset, overlay } = fixture();
  overlay.criteria!["crit-x-9"] = { text: "不存在。" };

  const problems = validateCapabilityOverlay(dataset, overlay);
  assert.ok(
    problems.some((p) => p.includes("criteria.crit-x-9 has no such record")),
    problems.join("\n"),
  );
});

test("a capability missing from the overlay is a violation", () => {
  const { dataset, overlay } = fixture();
  delete overlay.capabilities!["cap-x"];

  const problems = validateCapabilityOverlay(dataset, overlay);
  assert.ok(
    problems.some((p) => p.includes("capabilities.cap-x is missing")),
    problems.join("\n"),
  );
});

test("empty translations are violations", () => {
  const { dataset, overlay } = fixture();
  overlay.capabilities!["cap-x"]!.name = "  ";
  overlay.criteria!["crit-x-1"] = { text: "" };

  const problems = validateCapabilityOverlay(dataset, overlay);
  assert.ok(problems.some((p) => p.includes("capabilities.cap-x.name is missing or empty")));
  assert.ok(problems.some((p) => p.includes("criteria.crit-x-1.text is missing or empty")));
});

test("translation cannot rename a capability's criteria", () => {
  const { dataset, overlay } = fixture();
  overlay.capabilities!["cap-x"]!.description = "改写的描述。";

  const localized = localizeDataset(dataset, "zh");
  assert.deepEqual(
    localized.capabilities[0].criteria.map((c) => c.id),
    ["crit-x-1"],
  );
});
