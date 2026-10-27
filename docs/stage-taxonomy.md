# Capability Stage Taxonomy and Evidence Gates

## Important qualification

L0–L7 is an internal working taxonomy for organizing evidence. It is not an established scientific scale, a universal AGI definition, or a guarantee that development follows a linear path. Different capability areas can advance asynchronously. The dashboard must show per-capability assessments and uncertainty rather than one aggregate percentage.

## Working levels

### L0 — Human-led AI tools
AI supports bounded tasks, while humans drive the plan, validate outputs, and coordinate the workflow.

### L1 — Task execution autonomy
A system completes a bounded multi-step task using tools and intermediate decisions, with defined success criteria and limited human intervention.

### L2 — Research workflow autonomy
A system can plan and execute a research workflow, operate tools, evaluate intermediate results, and produce a traceable report. Evaluation must include failures and task-selection effects, not only selected success cases.

### L3 — Improvement strategy autonomy
A system generates and tests strategies intended to improve a model or research system. Evidence must isolate the contribution of the proposed strategy from additional compute, data, and human intervention.

### L4 — Autonomous data/model updating
A system reliably operates a data or model update loop with validation, rollback, and measurable performance outcomes. A scripted pipeline alone does not establish general autonomous improvement.

### L5 — Autonomous improvement mechanism
A system improves some part of the mechanism used to improve itself, and the improvement produces reproducible net gains under controlled comparisons. Improvements must survive independent checks and account for cost, regressions, and evaluation leakage.

### L6 — Physical R&D loop
AI meaningfully closes a design, validation, and deployment loop in physical research and development, potentially including chip design, lab experiments, fabrication, and hardware validation. Simulation-only results must be labeled as such.

### L7 — Industrial-scale recursive improvement
Improvement loops compound over time at industrial scale under real compute, energy, hardware, supply-chain, safety, and operational constraints. A plausible roadmap or isolated demonstration is insufficient.

## Assessment states

- **Unverified:** lead or assertion has not been adequately checked.
- **Partial:** some criteria are met, but material requirements remain unproven.
- **Demonstrated under conditions:** direct evidence supports a bounded result under stated conditions.
- **Independently reproduced:** a sufficiently independent party reproduced the relevant result or capability.
- **Contradicted:** material evidence conflicts with the assessment or claim.
- **Insufficient evidence:** available information does not support a defensible conclusion.

These states are not necessarily a single linear ranking. A reproduced narrow result does not prove generality.

## Evidence tiers

1. **Primary evidence:** papers and appendices, code, raw or documented benchmark results, technical reports, and experiment records.
2. **Independent evaluation:** external replication, independent benchmark audits, or well-documented third-party tests.
3. **Leads:** social posts, anonymous claims, forecasts, and vendor announcements without inspectable supporting evidence.

Leads can trigger research but cannot independently upgrade a capability assessment. Vendor-published results can be primary evidence for what the vendor reports, but should not automatically be treated as independent validation.

## Stage-change gate

Before proposing an upgrade, record:

1. The exact criterion being evaluated.
2. The claim and direct evidence supporting it.
3. Evaluation conditions and baseline.
4. The role of human intervention and hidden scaffolding.
5. Replication status and independence.
6. Counterevidence and alternative explanations.
7. Generalization limits, failures, cost, and regressions.
8. Reviewer decision and rationale.

A model can recommend a state change, but it cannot silently approve its own recommendation. All changes must be versioned and reversible.

## Non-goals

- No ungrounded AGI percentage.
- No automatic level assignment from headlines.
- No assumption that benchmark performance equals general capability.
- No assumption that one impressive demonstration establishes reliability or autonomous operation.
