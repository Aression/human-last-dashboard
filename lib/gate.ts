import type {
  AssessmentProposal,
  Dataset,
  Evidence,
  GateItemId,
  Source,
} from "./types";

/**
 * Stage-change gate, as specified in docs/stage-taxonomy.md.
 *
 * Design constraints (docs/PRD.md §8, AGENTS.md rule 4):
 *  - Leads never count as support.
 *  - Developer-affiliated sources count as primary evidence for what the
 *    developer reports, never as independent validation.
 *  - The reviewer decision is never derived; the verdict can be at most
 *    "ready-for-review". Only a human can accept a change.
 */

export type GateCheckState = "met" | "unmet" | "not-required" | "awaiting-human";

export interface GateCheck {
  id: GateItemId;
  label: string;
  state: GateCheckState;
  detail: string;
}

export interface GateResult {
  checks: GateCheck[];
  verdict: "blocked" | "ready-for-review";
  blockers: string[];
}

const NEEDS_DIRECT_EVIDENCE = new Set([
  "partial",
  "demonstrated-under-conditions",
  "independently-reproduced",
]);

function isAcceptedSupport(e: Evidence): boolean {
  return e.review_status === "accepted" && e.polarity === "supports";
}

export function evaluateGate(proposal: AssessmentProposal, ds: Dataset): GateResult {
  const sources = new Map<string, Source>(ds.sources.map((s) => [s.id, s]));
  const evidenceById = new Map(ds.evidence.map((e) => [e.id, e]));

  const supporting = proposal.supporting_evidence_ids
    .map((id) => evidenceById.get(id))
    .filter((e): e is Evidence => Boolean(e));
  const counter = proposal.counterevidence_ids
    .map((id) => evidenceById.get(id))
    .filter((e): e is Evidence => Boolean(e));

  const accepted = supporting.filter(isAcceptedSupport);
  const direct = accepted.filter((e) => {
    const tier = sources.get(e.source_id)?.source_tier;
    return tier === "primary" || tier === "independent";
  });
  const independent = accepted.filter((e) => {
    const s = sources.get(e.source_id);
    return s?.source_tier === "independent" && !s.developer_affiliated;
  });

  const needsDirect = NEEDS_DIRECT_EVIDENCE.has(proposal.to_status);
  const needsReplication = proposal.to_status === "independently-reproduced";
  const contradicting = proposal.to_status === "contradicted";

  const recorded = (id: GateItemId) => proposal.recorded[id]?.trim() || null;
  const checks: GateCheck[] = [];

  checks.push({
    id: "criterion",
    label: "Exact criterion identified",
    state: recorded("criterion") ? "met" : "unmet",
    detail: recorded("criterion") ?? "No criterion has been recorded for this proposal.",
  });

  if (contradicting) {
    const strong = counter.filter(
      (e) =>
        e.review_status === "accepted" &&
        ["primary", "independent"].includes(sources.get(e.source_id)?.source_tier ?? "lead"),
    );
    checks.push({
      id: "direct-evidence",
      label: "Direct evidence of the contradiction",
      state: strong.length ? "met" : "unmet",
      detail: strong.length
        ? `${strong.length} accepted record(s) from primary or independent sources.`
        : "No accepted primary or independent counterevidence is linked.",
    });
  } else if (needsDirect) {
    const detail = direct.length
      ? `${direct.length} accepted supporting record(s) from primary or independent sources.`
      : supporting.length
        ? `${supporting.length} supporting record(s) linked, but none is both accepted and from a primary or independent source (${supporting
            .map((e) => `${e.id}: ${e.review_status}`)
            .join(", ")}).`
        : "No supporting evidence is linked.";
    checks.push({
      id: "direct-evidence",
      label: "Direct supporting evidence",
      state: direct.length ? "met" : "unmet",
      detail,
    });
  } else {
    checks.push({
      id: "direct-evidence",
      label: "Direct supporting evidence",
      state: "not-required",
      detail: `A move to “${proposal.to_status}” does not assert a capability.`,
    });
  }

  checks.push({
    id: "conditions-baseline",
    label: "Evaluation conditions and baseline",
    state: recorded("conditions-baseline") ? "met" : "unmet",
    detail: recorded("conditions-baseline") ?? "Conditions and baseline are not recorded.",
  });
  checks.push({
    id: "human-intervention",
    label: "Human intervention and hidden scaffolding",
    state: recorded("human-intervention") ? "met" : "unmet",
    detail:
      recorded("human-intervention") ??
      "The role of human intervention and scaffolding has not been assessed.",
  });

  if (needsReplication) {
    checks.push({
      id: "replication",
      label: "Independent replication",
      state: independent.length ? "met" : "unmet",
      detail: independent.length
        ? `${independent.length} accepted record(s) from a source that is independent of the developer.`
        : "No accepted support comes from a party independent of the developer. Developer-reported results do not count as replication.",
    });
  } else {
    checks.push({
      id: "replication",
      label: "Independent replication",
      state: "not-required",
      detail: "Required only for “independently-reproduced”.",
    });
  }

  const hasCounterSearch = Boolean(recorded("counterevidence")) || counter.length > 0;
  checks.push({
    id: "counterevidence",
    label: "Counterevidence and alternatives searched",
    state: hasCounterSearch ? "met" : "unmet",
    detail: counter.length
      ? `${counter.length} counterevidence record(s) linked.`
      : (recorded("counterevidence") ?? "No counterevidence search is recorded."),
  });
  checks.push({
    id: "generalization",
    label: "Generalization limits, failures, cost, regressions",
    state: recorded("generalization") ? "met" : "unmet",
    detail: recorded("generalization") ?? "Limits and failures are not recorded.",
  });
  checks.push({
    id: "reviewer-decision",
    label: "Reviewer decision and rationale",
    state: "awaiting-human",
    detail: "Only a human reviewer can accept or reject. A model cannot approve its own proposal.",
  });

  const blockers: string[] = [];
  if (needsDirect && supporting.length > 0 && direct.length === 0) {
    const allLeads = supporting.every(
      (e) => sources.get(e.source_id)?.source_tier === "lead",
    );
    blockers.push(
      allLeads
        ? "Support comes from leads only; leads cannot move a stage."
        : "No supporting record is both accepted and primary or independent.",
    );
  }
  if (needsReplication && direct.length > 0 && independent.length === 0) {
    blockers.push("Support is developer-affiliated only; it cannot establish independent reproduction.");
  }
  // Fall back to the first unmet check so a blocked verdict always names a reason.
  if (blockers.length === 0) {
    const first = checks.find((c) => c.state === "unmet");
    if (first) blockers.push(`${first.label}: not met.`);
  }

  return {
    checks,
    verdict: checks.some((c) => c.state === "unmet") ? "blocked" : "ready-for-review",
    blockers,
  };
}
