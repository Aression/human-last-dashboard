import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateGate, type GateCheck, type GateResult } from "./gate";
import type {
  AssessmentProposal,
  Dataset,
  Evidence,
  GateItemId,
  Source,
} from "./types";

/**
 * Behavioural tests for the stage-change gate (docs/stage-taxonomy.md).
 * These pin the rules that must never regress:
 *  - leads never count as support;
 *  - only accepted evidence counts;
 *  - developer-affiliated sources are not independent;
 *  - "independently-reproduced" needs a party independent of the developer;
 *  - the verdict never exceeds "ready-for-review";
 *  - the reviewer decision is always left to a human.
 */

function source(over: Partial<Source> & { id: string }): Source {
  return {
    provenance: "demo",
    created_at: "2026-01-01",
    canonical_url: null,
    title: `fictional source ${over.id}`,
    publisher: "Fictional Lab",
    authors: [],
    published_at: null,
    retrieved_at: null,
    source_type: "experiment",
    source_tier: "primary",
    developer_affiliated: false,
    content_hash: null,
    status: "reviewed",
    ...over,
  };
}

function evidence(
  id: string,
  over: Partial<Evidence> & { source_id: string },
): Evidence {
  return {
    id,
    provenance: "demo",
    created_at: "2026-01-01",
    evidence_type: "direct-result",
    polarity: "supports",
    observation: "Fictional observation.",
    method: "Fictional method.",
    limitations: "Fictional limitations.",
    reproducibility_notes: "Fictional notes.",
    review_status: "accepted",
    claim_ids: [],
    capability_ids: ["cap-l1"],
    ...over,
  };
}

const RECORDED: AssessmentProposal["recorded"] = {
  criterion: "crit-l1-1: completes a bounded multi-step task.",
  "conditions-baseline": "Suite T-1, fixed tool set, released harness.",
  "human-intervention": "No human correction during the reported runs.",
  counterevidence: "Searched the audit and the failure analysis.",
  generalization: "One task suite only; no new task families tested.",
};

function proposal(over: Partial<AssessmentProposal> = {}): AssessmentProposal {
  return {
    id: "p-01",
    provenance: "demo",
    created_at: "2026-10-12",
    capability_id: "cap-l1",
    from_status: "unverified",
    to_status: "demonstrated-under-conditions",
    rationale: "Fictional proposal.",
    supporting_evidence_ids: [],
    counterevidence_ids: [],
    recorded: { ...RECORDED },
    ...over,
  };
}

function dataset(sources: Source[], records: Evidence[]): Dataset {
  return {
    label: "test dataset",
    sources,
    claims: [],
    evidence: records,
    capabilities: [],
    assessments: [],
    proposals: [],
    events: [],
    attributions: [],
    forecasts: [],
    questions: [],
  };
}

function check(result: GateResult, id: GateItemId): GateCheck {
  const found = result.checks.find((c) => c.id === id);
  assert.ok(found, `expected a "${id}" check in the gate result`);
  return found;
}

test("leads never count as support", () => {
  const lead = source({ id: "s-lead", source_tier: "lead" });
  const leadEvidence = evidence("e-lead", {
    source_id: lead.id,
    review_status: "accepted",
    polarity: "supports",
  });

  const result = evaluateGate(
    proposal({ supporting_evidence_ids: [leadEvidence.id] }),
    dataset([lead], [leadEvidence]),
  );

  assert.equal(check(result, "direct-evidence").state, "unmet");
  assert.equal(result.verdict, "blocked");
  assert.ok(
    result.blockers.some((b) => /leads only/i.test(b)),
    `expected a leads-only blocker, got ${JSON.stringify(result.blockers)}`,
  );
});

test("only accepted evidence supports a stage change", () => {
  const primary = source({ id: "s-primary", source_tier: "primary" });
  const unreviewed = evidence("e-unreviewed", {
    source_id: primary.id,
    review_status: "needs-follow-up",
    polarity: "supports",
  });

  const result = evaluateGate(
    proposal({ supporting_evidence_ids: [unreviewed.id] }),
    dataset([primary], [unreviewed]),
  );

  const direct = check(result, "direct-evidence");
  assert.equal(direct.state, "unmet");
  assert.match(direct.detail, /none is both accepted and from a primary or independent source/);
  assert.equal(result.verdict, "blocked");
});

test("developer-affiliated sources are not independent validation", () => {
  const affiliated = source({
    id: "s-affiliated",
    source_tier: "independent",
    developer_affiliated: true,
  });
  const affiliatedEvidence = evidence("e-affiliated", {
    source_id: affiliated.id,
    review_status: "accepted",
    polarity: "supports",
  });

  const result = evaluateGate(
    proposal({
      to_status: "independently-reproduced",
      supporting_evidence_ids: [affiliatedEvidence.id],
    }),
    dataset([affiliated], [affiliatedEvidence]),
  );

  assert.equal(check(result, "direct-evidence").state, "met");
  assert.equal(check(result, "replication").state, "unmet");
  assert.equal(result.verdict, "blocked");
  assert.ok(
    result.blockers.some((b) => /developer-affiliated only/i.test(b)),
    `expected a developer-affiliation blocker, got ${JSON.stringify(result.blockers)}`,
  );
});

test("independently-reproduced requires support from an independent party", () => {
  const independent = source({
    id: "s-independent",
    source_tier: "independent",
    developer_affiliated: false,
  });
  const independentEvidence = evidence("e-independent", {
    source_id: independent.id,
    review_status: "accepted",
    polarity: "supports",
  });
  const proposalToReproduced = proposal({
    to_status: "independently-reproduced",
    supporting_evidence_ids: [independentEvidence.id],
  });

  const ready = evaluateGate(
    proposalToReproduced,
    dataset([independent], [independentEvidence]),
  );
  assert.equal(check(ready, "replication").state, "met");
  assert.equal(ready.verdict, "ready-for-review");
  assert.deepEqual(ready.blockers, []);

  const affiliated = source({
    id: "s-affiliated-2",
    source_tier: "independent",
    developer_affiliated: true,
  });
  const affiliatedEvidence = evidence("e-affiliated-2", {
    source_id: affiliated.id,
    review_status: "accepted",
    polarity: "supports",
  });
  const blocked = evaluateGate(
    proposalToReproduced,
    dataset([affiliated], [affiliatedEvidence]),
  );
  assert.equal(blocked.verdict, "blocked");
});

test("the verdict never exceeds ready-for-review, and the reviewer decision stays human", () => {
  const independent = source({ id: "s-independent", source_tier: "independent" });
  const record = evidence("e-01", {
    source_id: independent.id,
    review_status: "accepted",
    polarity: "supports",
  });
  const allMet = evaluateGate(
    proposal({ supporting_evidence_ids: [record.id] }),
    dataset([independent], [record]),
  );
  const nothingRecorded = evaluateGate(
    proposal({ recorded: {}, supporting_evidence_ids: [] }),
    dataset([independent], [record]),
  );

  for (const result of [allMet, nothingRecorded]) {
    assert.ok(
      ["blocked", "ready-for-review"].includes(result.verdict),
      `unexpected verdict ${result.verdict}`,
    );
    assert.equal(check(result, "reviewer-decision").state, "awaiting-human");
  }
  assert.equal(allMet.verdict, "ready-for-review");
  assert.equal(nothingRecorded.verdict, "blocked");
  assert.doesNotThrow(() => {
    const verdict: GateResult["verdict"] = allMet.verdict;
    if (verdict === "ready-for-review") return;
    throw new Error("verdict regressed below ready-for-review");
  });
});

test("a contradiction requires accepted primary or independent counterevidence", () => {
  const independent = source({ id: "s-independent", source_tier: "independent" });
  const strong = evidence("e-contradiction", {
    source_id: independent.id,
    review_status: "accepted",
    polarity: "contradicts",
  });
  const lead = source({ id: "s-lead", source_tier: "lead" });
  const weak = evidence("e-lead-counter", {
    source_id: lead.id,
    review_status: "accepted",
    polarity: "contradicts",
  });

  const supported = evaluateGate(
    proposal({ to_status: "contradicted", counterevidence_ids: [strong.id] }),
    dataset([independent], [strong]),
  );
  assert.equal(check(supported, "direct-evidence").state, "met");
  assert.equal(check(supported, "direct-evidence").label, "Direct evidence of the contradiction");
  assert.equal(supported.verdict, "ready-for-review");

  const unsupported = evaluateGate(
    proposal({ to_status: "contradicted", counterevidence_ids: [weak.id] }),
    dataset([lead], [weak]),
  );
  assert.equal(check(unsupported, "direct-evidence").state, "unmet");
  assert.equal(unsupported.verdict, "blocked");
});
