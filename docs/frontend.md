# Frontend

This document describes the dashboard UI as implemented: routes, the visual grammar, how data reaches the views, how the stage gate is computed, and how to replace the demonstration data. It implements the four main views listed in [PRD §7](PRD.md).

## 1. Status

The UI renders a **fictional demonstration dataset** from `lib/demo-data.ts`. There is no database, ingestion, authentication, or model call. Every page shows a demo banner, and every demo record carries a `Demo` tag. Do not cite demo content as evidence about any real system (AGENTS.md rules 2 and 10).

## 2. Routes

| Route | View | Purpose |
| --- | --- | --- |
| `/` | Overview | Counts, proposed changes waiting on review, recent changes, bottlenecks in view, legend. |
| `/progress` | Progress | One row per capability: current status, confidence, evidence tally, version. No aggregate score. |
| `/progress/[id]` | Capability detail | Criteria and non-criteria, current assessment, proposed change with gate checklist, linked evidence, version history. |
| `/evidence` | Evidence Explorer | Tabs for evidence, claims, and sources with search and facet filters. |
| `/evidence/[id]` | Record detail | A source (`s-`), claim (`c-`), or evidence (`e-`) record, resolved by id, with cross-links. |
| `/research` | Research & Attribution | Observed events with competing explanations, forecasts, unresolved questions. |

All routes are statically generated. `/evidence` is the only route with client-side state (search and filters); it receives its data as props so the dataset is not imported into the client bundle separately.

## 3. Visual grammar

The interface encodes the epistemic status of text in its structure, not only in color, so the distinction holds for color-blind readers and in grayscale (PRD §8: *the UI distinguishes observed facts from model-generated inference*).

| Kind | Marker | Use |
| --- | --- | --- |
| Observed fact | Solid left rule | Evidence observations, `observed-fact` claims, event descriptions. |
| Interpretation | Dashed left rule | `author-interpretation` claims, assessment rationales, proposal rationales. |
| Speculation or hypothesis | Dotted left rule, italic | `speculation` claims, attribution hypotheses, unresolved questions. |
| Forecast | Double left rule | Forecast statements. |
| Model-generated | Diagonal hatch background plus a `Model-generated` tag | Any record with `generated_by` set. |

Implemented in `components/Statement.tsx` and the `.ep-*` classes in `app/globals.css`. Use `<Statement kind=… model>` for any new statement so the grammar stays consistent.

**Evidence tally.** Each evidence record is drawn as one small square on the Progress page. Color is polarity (supports, contradicts, qualifies, context); a solid fill means *accepted* and a dashed hollow square means not yet accepted. Squares are counted records, not a progress bar. Nothing on the page maps a count to a percentage.

**Assessment status chips** pair a glyph with a text label (`○ ◐ ● ◉ ✕ ◌`), so status never depends on color alone.

## 4. Data flow

```text
lib/capabilities.ts ─┐
lib/demo-data.ts ────┴─> lib/selectors.ts ──> server components (pages)
                              │                     │
                              └─> lib/gate.ts       └─> components/EvidenceExplorer.tsx (client, via props)
```

- `lib/types.ts` mirrors [evidence-model.md](evidence-model.md) in TypeScript.
- `lib/capabilities.ts` is framework content (L0–L7 definitions with stable criterion ids such as `crit-l3-2`). It is not demo data and is the source of truth for capability definitions.
- `lib/demo-data.ts` exports one `dataset` object. It is the only module that pages should treat as replaceable.
- `lib/selectors.ts` builds id lookups and derived views (current assessment, history, tallies, recent activity). Selectors throw on dangling references so broken demo data fails the build instead of rendering silently.
- `lib/labels.ts` holds display labels and date formatting.

## 5. Stage gate (`lib/gate.ts`)

The gate implements the checklist in [stage-taxonomy.md](stage-taxonomy.md) as a pure function of a proposal and the dataset. It is computed, never stored.

- **Leads never count as support.**
- **Developer-affiliated sources count as primary evidence of what the developer reports**, never as independent validation. Moving to `independently-reproduced` requires accepted support from an independent-tier source that is not developer-affiliated.
- Direct evidence must be **accepted** (review status) as well as primary or independent. An unreviewed or needs-follow-up record does not satisfy the check.
- Checklist items the evidence cannot establish (criterion, conditions and baseline, human intervention, counterevidence search, generalization limits) must be recorded by a person on the proposal; otherwise they are unmet.
- The **reviewer decision is always "awaiting human"**. The best possible verdict is `ready-for-review`; the UI has no control that accepts a change, and no code path promotes a proposal to an assessment.

The demo proposal `p-01` (L3) is blocked on purpose: its only support is a developer paper whose review status is `needs-follow-up`.

## 6. Mapping to PRD §8 acceptance criteria

| Criterion | Where it is met | Status |
| --- | --- | --- |
| Every displayed assessment links to the evidence and criteria supporting it | `/progress/[id]`: criteria with ids, cited evidence ids linking to cards, rationale, conditions, limitations | Implemented for the demo dataset |
| Unverified or vendor-only claims cannot independently pass a stage gate | `lib/gate.ts`, shown by `GateChecklist` | Implemented in the UI logic; there is no persistence or server-side enforcement yet |
| Evidence can support, contradict, or qualify a claim | `polarity` on evidence; chips, tally, and grouped lists | Implemented |
| UI distinguishes observed facts from model-generated inference | §3 | Implemented |
| Changes preserve prior versions and a rationale | Assessment history on `/progress/[id]` | Displayed; versioning is not enforced because nothing is written yet |
| Demo records are visibly labeled | Banner on every page, `Demo` tag on records, footer | Implemented |
| App builds and type-checks in a clean environment | `npm run build`, `npm run typecheck` | Verified once locally; see §8 |

## 7. Replacing the demo data

1. Keep the shapes in `lib/types.ts`. If a real model needs a different shape, change `types.ts` and `docs/evidence-model.md` together.
2. Replace `lib/demo-data.ts` with a loader that returns the same `Dataset`. Use `provenance: "curated"` for real records so the `Demo` tag disappears for them; keep fictional records tagged `demo`.
3. Remove or reword the demo banner in `app/layout.tsx` only when no demo record can reach the UI.
4. Real sources need an observed `canonical_url`, `retrieved_at`, and `content_hash`. Never fill these in for a source that was not retrieved.
5. When data moves to a database, keep the selectors' contract (throw on dangling ids) and move the gate to the server so it is enforced where changes are written.

## 8. Known limitations

- Data is static and in-repo; filters are client-side only and not reflected in the URL.
- No numeric calibration is displayed for forecasts. The page states that two resolved forecasts are too few; add a calibration view only when the sample supports it.
- Pages are English only.
- The gate runs in the UI layer. It demonstrates the rules but does not enforce them.
- No automated tests exist yet. Validation to date is type-checking, a production build, and manual review of screenshots at desktop (1360 px) and phone (390 px) widths.
- `npm run lint` does not currently run: `eslint.config.mjs` imports `eslint-config-next/core-web-vitals` in the form used by eslint-config-next 16, while `package.json` pins `^15.5.0`. Align the two (upgrade the package or adapt the config) before relying on lint in CI. `next build` prints the same error in its lint step but completes.
