# Evidence and Attribution Data Model

This is the initial logical model. Physical schema and migrations will be added after the MVP workflows are validated.

## Source

Represents a retrievable artifact or publication.

Fields:
- `id`: stable internal identifier.
- `canonical_url`: normalized URL, when available.
- `title`, `publisher`, `authors`.
- `published_at`: source publication time, if known.
- `retrieved_at`: time captured by this system.
- `source_type`: paper, technical report, benchmark, repository, experiment, announcement, discussion, or other.
- `source_tier`: primary, independent evaluation, or lead.
- `content_hash`: hash of the captured content.
- `snapshot_ref`: pointer to stored source content, when permitted.
- `status`: candidate, reviewed, unavailable, or rejected.

## Claim

A discrete proposition extracted from or proposed by a source.

Fields:
- `id`, `source_id`.
- `statement`: atomic, testable wording.
- `claim_type`: observed fact, author interpretation, forecast, or speculation.
- `source_span`: quote, page, section, or code location supporting the extraction.
- `conditions`: task, model/version, compute, data, tools, benchmark, and evaluation protocol.
- `limitations`: scope and caveats.
- `extraction_status`: candidate, source-supported, unsupported, or reviewed.

A claim is not equivalent to the truth of the proposition. It records what is asserted and how it is supported.

## Evidence

A piece of evidence bearing on one or more claims or capability criteria.

Fields:
- `id`, `source_id`.
- `evidence_type`: direct result, reproduction, independent evaluation, benchmark result, code inspection, expert analysis, or other.
- `polarity`: supports, contradicts, qualifies, or contextualizes.
- `observation`: what was actually observed.
- `method`: how the observation was produced.
- `limitations`, `reproducibility_notes`.
- `review_status`: unreviewed, accepted, rejected, or needs follow-up.

## Capability

A named capability with operational criteria.

Fields:
- `id`, `name`, `description`, `level` (optional L0–L7 mapping).
- `criteria`: measurable pass conditions.
- `non_criteria`: what does not count as sufficient evidence.
- `known_bottlenecks`.

## Assessment

A versioned judgement of a capability against its criteria.

Fields:
- `id`, `capability_id`, `version`, `taxonomy_version` (the version of the capability definitions the assessment was made under; the current assessment of each capability must match the dataset's `taxonomy_version`).
- `status`: unverified, partial, demonstrated-under-conditions, independently-reproduced, contradicted, or insufficient-evidence.
- `confidence`: qualitative or calibrated numeric value with documented semantics.
- `supporting_evidence_ids`, `counterevidence_ids`.
- `conditions`, `limitations`, `rationale`.
- `reviewer`, `reviewed_at`, `supersedes_assessment_id`.

## Attribution

A causal hypothesis explaining an observed change.

Fields:
- `id`, `event_id`.
- `hypothesis`, `mechanism`, `supporting_evidence_ids`, `counterevidence_ids`.
- `alternatives`, `confidence`, `assumptions`, `status`.

Attribution must remain a hypothesis unless the available evidence supports stronger causal identification.

## Forecast

A time-bounded prediction with explicit resolution rules.

Fields:
- `id`, `statement`, `created_at`, `resolution_date`.
- `resolution_criteria`, `probability` (optional), `rationale`, `evidence_ids`.
- `status`: open, resolved-true, resolved-false, ambiguous, or expired.
- `resolution_notes`, `resolved_at`.

Preserve the original prediction and its probability; do not rewrite it after seeing the outcome.

## Relationships

- A Source may contain many Claims and Evidence records.
- Evidence may support or contradict multiple Claims and Capability criteria.
- A Capability has many versioned Assessments.
- An Assessment references both supporting evidence and counterevidence.
- An Attribution links an event to evidence and alternative hypotheses.
- A Forecast is resolved against evidence under criteria defined before resolution.

## Presentation-layer extensions

The TypeScript types in `lib/types.ts` add the following fields. They are proposals made while building the UI and should be confirmed before a database schema is written.

- `provenance` (`demo` or `curated`) on every record: distinguishes fictional demonstration data from real records.
- `generated_by` (`model`, `workflow_version`), optional: present when a model produced the record. Required by the output contract in [agent-workflows.md](agent-workflows.md).
- `Source.developer_affiliated` (boolean): the reporting party built or operates the system reported on. Source tier alone cannot express this, and the stage gate needs it to separate developer-reported results from independent validation.
- `Evidence.claim_ids` and `Evidence.capability_ids`: the many-to-many links described under Relationships, stored directly for display.
- `AssessmentProposal`: a proposed status change held outside the accepted assessment history until a reviewer decides. Gate results are derived, not stored.
- `Capability.criteria` items have stable ids (`crit-l3-2`), and `non_criteria` / `known_bottlenecks` are camelCase (`nonCriteria`, `knownBottlenecks`) in `data/capabilities.ts`, which is the source of truth for capability definitions.

## Provenance requirements

Every derived record should identify its origin, creation time, processing method, and relevant model/workflow version. Corrections should create an audit event or new version instead of erasing material history.
