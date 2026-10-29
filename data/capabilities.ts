import type { Capability } from "../lib/types";

/**
 * Version of the capability definitions below. Every assessment pins the version
 * it was made under (`Assessment.taxonomy_version`), so editing a criterion
 * cannot silently change what an existing assessment meant.
 *
 * Changing any criterion, non-criterion, or level definition requires bumping
 * this string AND the hash in `capabilities.test.ts`; the validator then requires
 * the latest assessment of every capability to be re-made under the new version.
 * Definitions of superseded versions are not retained here yet; keep them in git
 * history until a taxonomy archive exists.
 */
export const TAXONOMY_VERSION = "taxonomy-1";

/**
 * Working capability taxonomy (L0–L7).
 *
 * Source of truth: docs/stage-taxonomy.md. The criteria, non-criteria, and
 * hurdles below are drafted from the wording of that document and are a
 * working set for reviewers to refine — not an established scientific scale.
 *
 * This file is framework content, not demo data: it makes no claim about the
 * current state of any AI system.
 */
export const CAPABILITIES: Capability[] = [
  {
    id: "cap-l0",
    level: "L0",
    name: "Human-led AI tools",
    description:
      "AI supports bounded tasks, while humans drive the plan, validate outputs, and coordinate the workflow.",
    criteria: [
      {
        id: "crit-l0-1",
        text: "AI assists with bounded tasks while a human sets the plan and validates the outputs.",
      },
    ],
    nonCriteria: [
      "AI assistance in a workflow does not by itself indicate any autonomy.",
    ],
    knownBottlenecks: [],
  },
  {
    id: "cap-l1",
    level: "L1",
    name: "Task execution autonomy",
    description:
      "A system completes a bounded multi-step task using tools and intermediate decisions, with defined success criteria and limited human intervention.",
    criteria: [
      {
        id: "crit-l1-1",
        text: "Completes a bounded multi-step task using tools and intermediate decisions.",
      },
      {
        id: "crit-l1-2",
        text: "Success criteria are defined in advance and human intervention is limited and recorded.",
      },
    ],
    nonCriteria: [
      "A single successful run without defined success criteria.",
      "Completion that depends on unrecorded human correction.",
    ],
    knownBottlenecks: [
      "Separating autonomous steps from human intervention and hidden scaffolding.",
    ],
  },
  {
    id: "cap-l2",
    level: "L2",
    name: "Research workflow autonomy",
    description:
      "A system can plan and execute a research workflow, operate tools, evaluate intermediate results, and produce a traceable report.",
    criteria: [
      {
        id: "crit-l2-1",
        text: "Plans and executes a research workflow, operating tools and evaluating intermediate results.",
      },
      {
        id: "crit-l2-2",
        text: "Produces a traceable report; the evaluation includes failures, not only selected successes.",
      },
    ],
    nonCriteria: [
      "Selected success cases without a record of failures or of how tasks were chosen.",
    ],
    knownBottlenecks: [
      "Task-selection effects and survivorship in reported examples.",
      "Verifying that reports trace back to the actual workflow.",
    ],
  },
  {
    id: "cap-l3",
    level: "L3",
    name: "Improvement strategy autonomy",
    description:
      "A system generates and tests strategies intended to improve a model or research system.",
    criteria: [
      {
        id: "crit-l3-1",
        text: "Generates and tests strategies intended to improve a model or research system.",
      },
      {
        id: "crit-l3-2",
        text: "Evidence isolates the strategy's contribution from added compute, data, and human intervention.",
      },
    ],
    nonCriteria: [
      "Improvement that cannot be separated from additional compute, data, or human effort.",
    ],
    knownBottlenecks: [
      "Attributing a gain to the proposed strategy rather than to confounders.",
    ],
  },
  {
    id: "cap-l4",
    level: "L4",
    name: "Autonomous data/model updating",
    description:
      "A system reliably operates a data or model update loop with validation, rollback, and measurable performance outcomes.",
    criteria: [
      {
        id: "crit-l4-1",
        text: "Operates a data or model update loop reliably, with validation and rollback.",
      },
      {
        id: "crit-l4-2",
        text: "Performance outcomes of the loop are measured.",
      },
    ],
    nonCriteria: [
      "A scripted pipeline alone does not establish general autonomous improvement.",
    ],
    knownBottlenecks: [
      "Distinguishing an autonomous loop from a fixed, human-designed pipeline.",
    ],
  },
  {
    id: "cap-l5",
    level: "L5",
    name: "Autonomous improvement mechanism",
    description:
      "A system improves some part of the mechanism used to improve itself, and the improvement produces reproducible net gains under controlled comparisons.",
    criteria: [
      {
        id: "crit-l5-1",
        text: "Improves part of the mechanism used to improve the system itself.",
      },
      {
        id: "crit-l5-2",
        text: "Net gains are reproducible under controlled comparisons and survive independent checks, accounting for cost, regressions, and evaluation leakage.",
      },
    ],
    nonCriteria: [
      "Gains that ignore cost or regressions, or that are not independently checked.",
    ],
    knownBottlenecks: [
      "Evaluation leakage and uncontrolled comparisons.",
      "Independent replication of self-improvement claims.",
    ],
  },
  {
    id: "cap-l6",
    level: "L6",
    name: "Physical R&D loop",
    description:
      "AI meaningfully closes a design, validation, and deployment loop in physical research and development, potentially including chip design, lab experiments, fabrication, and hardware validation.",
    criteria: [
      {
        id: "crit-l6-1",
        text: "Closes a design, validation, and deployment loop in physical R&D.",
      },
    ],
    nonCriteria: [
      "Simulation-only results, unless explicitly labeled as simulation and not counted as a physical loop.",
    ],
    knownBottlenecks: [
      "Physical validation and fabrication cycles sit outside purely digital evidence.",
    ],
  },
  {
    id: "cap-l7",
    level: "L7",
    name: "Industrial-scale recursive improvement",
    description:
      "Improvement loops compound over time at industrial scale under real compute, energy, hardware, supply-chain, safety, and operational constraints.",
    criteria: [
      {
        id: "crit-l7-1",
        text: "Improvement loops compound over time at industrial scale under real-world constraints.",
      },
    ],
    nonCriteria: [
      "A plausible roadmap or an isolated demonstration.",
    ],
    knownBottlenecks: [
      "Compute, energy, hardware, supply-chain, safety, and operational constraints.",
    ],
  },
];
