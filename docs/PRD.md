# Product Requirements Document

## 1. Product objective

Build an evidence-traceable monitoring system for meaningful progress toward increasingly autonomous AI research and recursive self-improvement. It should help a technically informed reader distinguish demonstrated capabilities from marketing, extrapolation, and speculation.

## 2. Target users

- AI researchers and engineers tracking autonomous research systems.
- Technical analysts comparing claims across labs and independent evaluators.
- Project maintainers who need an auditable history of why an assessment changed.

## 3. Core user questions

1. What new result or claim appeared?
2. What is the primary evidence and how can it be inspected?
3. Under what task, compute, data, and evaluation conditions was it obtained?
4. What alternative explanations and counterevidence exist?
5. Which capability does it support, and what does it not establish?
6. What changed in the overall assessment, and why?

## 4. Product principles

- Evidence-first and provenance-preserving.
- Explicit uncertainty and verification status.
- Separate evidence extraction from interpretation and assessment.
- Counterevidence and independent replication are visible.
- Stage assessments are criterion-based, versioned, and reversible.
- Predictions are timestamped and scored after their resolution date.
- No composite AGI percentage unless a defensible, documented measurement model exists.

## 5. MVP scope

### Included

- A dashboard shell with Overview, Progress, Evidence Explorer, and Research & Attribution sections.
- A documented evidence model.
- A manually curated initial source workflow.
- Structured claims, evidence links, verification status, capability mapping, and assessment history.
- A defined review gate for any stage-assessment change.
- A clear distinction between demonstration data and verified records.

### Excluded from the first milestone

- Fully autonomous web-scale crawling.
- Automatic acceptance of model-generated claims.
- A universal numeric AGI score.
- Complex knowledge-graph infrastructure before relational data needs are established.
- Autonomous publication without review and audit trail.
- Production authentication or multi-tenant permissions until deployment requirements are decided.

## 6. Core workflows

### Source review

Register a source → preserve its metadata and snapshot → extract candidate claims → validate each claim against the source → attach evidence and limitations → search for independent evaluations and counterevidence → approve, reject, or retain as an unverified lead.

### Capability assessment

Select a capability criterion → collect supporting and contradicting evidence → record operating conditions and known limitations → propose a status and confidence → pass the relevant review gate → publish a versioned assessment with rationale.

### Forecast tracking

Create a time-bounded, falsifiable prediction → specify the resolution criteria and date → preserve the original wording → resolve against evidence → record outcome and calibration metrics.

## 7. Main views

- **Overview:** recent evidence, pending reviews, assessment changes, active bottlenecks, and forecast outcomes.
- **Progress:** capability-by-capability status and history, not a single progress percentage.
- **Evidence Explorer:** search and filter sources, claims, methods, benchmark conditions, and counterevidence.
- **Research & Attribution:** competing explanations, causal hypotheses, unresolved questions, and forecasts.

## 8. Acceptance criteria for the MVP

- Every displayed assessment links to the evidence and criteria supporting it.
- Unverified or vendor-only claims cannot independently pass a stage gate.
- Evidence can support, contradict, or qualify a claim.
- The UI distinguishes observed facts from model-generated inference.
- Changes to assessments preserve prior versions and a human-readable rationale.
- Demo records are visibly labeled as demo data.
- The app builds and type-checks in a clean environment.

## 9. Success measures

- Percentage of published assessments with traceable primary evidence.
- Time from source discovery to reviewed evidence record.
- Rate of claims corrected or downgraded after counterevidence.
- Forecast calibration over resolved predictions.
- Reproducibility of an assessment by a second reviewer.
