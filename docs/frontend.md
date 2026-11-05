# Frontend

This document describes the dashboard UI as implemented: routes, the visual grammar, how data reaches the views, how the stage gate is computed, and how to add or refresh the data. It implements the four main views listed in [PRD §7](PRD.md).

## 1. Status

The UI renders **agent-curated records** from `data/curated/records.json`: 13 real sources (eight arXiv papers, two vendor posts, three repositories) with the URL, retrieval timestamp, and sha256 of the page each was built from, plus 20 claims, 17 evidence records, 8 assessments, one observed event, one attribution, two forecasts, and two open questions. `data/demo/dataset.ts` is still in the repository, but it is a fixture for the validator, the selectors and the gate — **no page loads it**.

The records are unreviewed. Every evidence record is `review_status: "unreviewed"` and every assessment records `reviewer: "none — agent draft, not human-reviewed"`, so the pages state that these are unreviewed agent drafts rather than presenting them as accepted findings. A curation agent can publish a record; it cannot accept its own evidence, and no code path lifts a stage (AGENTS.md rules 2–4).

The interface ships in English and Chinese from one static build: English at `/…`, Chinese at `/zh/…`. See §2 for the routing and §4 for the overlay files.

The dataset is checked at three levels: `lib/types.ts` for compile-time shapes, `lib/validate.ts` for runtime integrity (unique prefixed ids, resolving references, one unbroken assessment version chain per capability, curated records that cite a canonical URL, retrieval time and content hash, assessments pinned to the dataset's taxonomy version, forecast resolutions that record when and why), and `lib/records-i18n.ts` for the translation overlays (every entry must name a record that exists, every field must be translatable, every ordered array must match the data). Validation runs on every build and in `npm run validate:data`; the gate, selectors, validator, overlays and i18n helpers have behavioural tests in `npm test`.

`/automation` renders a second, separate input: `data/automation/snapshot.json`, a committed snapshot of the leads the local evidence automation discovered. Those leads are not dataset records and never appear in a claim, evidence tally, or assessment — no page merges the two, and the dataset's own gates do not look at them.

## 2. Routes

Every route below exists twice: English without a prefix, Chinese under `/zh`. `middleware.ts` rewrites an unprefixed request to the same path under `/en`, so there is one implementation per view and both trees are prerendered.

| Route | View | Purpose |
| --- | --- | --- |
| `/` | Overview | Counts; a capability board (one tile per level: status and linked evidence); an evidence histogram by direction; a source-base chart; proposed changes waiting on review; recent changes. Bottlenecks and the legend are folded. |
| `/progress` | Progress | One row per capability under column headers: current status, confidence, linked evidence drawn as squares grouped by direction with a count. No aggregate score. |
| `/progress/[id]` | Capability detail | Criteria and non-criteria, current assessment, proposed change with gate checklist, linked evidence, version history. |
| `/evidence` | Evidence Explorer | Tabs for evidence, claims, and sources with search and facet filters; state is kept in the URL. |
| `/evidence/[id]` | Record detail | A source (`s-`), claim (`c-`), or evidence (`e-`) record, resolved by id, with cross-links and a provenance panel. |
| `/research` | Research & Attribution | Observed events with competing explanations, forecasts, unresolved questions. |
| `/automation` | Automation | Discovered leads from the local evidence automation, the last audit run rule by rule, and what none of it establishes. |

All routes are statically generated: `app/[locale]/…` with `generateStaticParams()` over the locale list (plus ids for detail routes), and 129 pages in the current build. `/evidence` is the only route with client-side state (search and filters); it receives its data as props so the dataset is not imported into the client bundle separately.

**Locale routing.** `lib/i18n/index.ts` owns the locale list (`en`, `zh`), `localePath(locale, path)`, `stripLocale`, `localeFromPathname`, and `fill(template, values)` for the two placeholder styles the dictionaries use. A locale is a URL prefix rather than a cookie because the site is prerendered and a cookie swap would paint English first and replace it after hydration. `components/LanguageSwitch.tsx` links the current pathname and query to the other locale; it reads the query through `useSyncExternalStore` rather than `useSearchParams`, which would need a Suspense boundary on every prerendered page.

**Chinese translation of data.** Record prose is translated by overlay, not by localized fields on every type: `data/i18n/records.zh.json` (keyed by record id, field allowlist per collection) and `data/i18n/capabilities.zh.json` (capability names, descriptions, criteria and non-criteria, order-matched by id). `lib/records-i18n.ts` validates both against the dataset and `localizeDataset(dataset, locale)` returns a translated copy; `selectorsFor(locale)` in `lib/data/index.ts` memoises one selector set per locale. The English dataset is returned by reference, and quotations — a claim's `source_span` — are never translated, because a quotation belongs to the document it was taken from. One class of string is translated at render time instead of by overlay: the /automation page prints retrieval failure reasons and per-lead notes that the tooling writes in English (
ate limited (HTTP 429), 
etrieval failed: …). localizeReason and localizeNote in lib/automation.ts translate the label and keep the machine detail verbatim, because a paraphrased error string would no longer be checkable. A stale overlay fails the build rather than silently rendering English inside a Chinese page.

**Explorer state in the URL.** The explorer mirrors `tab`, `q`, `tier`, `polarity`, `review`, and `claimType` into the query string — `?tab=claims&tier=independent&q=benchmark` — and omits defaults, so a copied link carries only what was chosen. Writes use `window.history.replaceState`, not the router, because the page is prerendered: there is no server state to refetch, and one soft navigation per keystroke would be wasted work. Replacing rather than pushing keeps Back pointing at the previous page instead of walking through filter states. Because the URL can only be read in the browser, a shared link renders the unfiltered list for one frame before the filter applies; the page says so next to the filters. Unrelated query keys and the hash are preserved.

**Provenance panel.** Record detail pages end with `components/ProvenancePanel.tsx`, which lists only fields the record actually stores — id, provenance, creation date, model/workflow attribution, and for sources the canonical URL, retrieval time, content hash, snapshot, status, type, tier, and developer affiliation. A field with no value reads "not observed" or "not recorded" rather than being omitted or shown as unavailable, and every panel closes with what that kind of record does not establish. This is the UI counterpart of the rule that a record must never imply a retrieval, snapshot, or verification it does not have (AGENTS.md rules 2, 3, 4).

**Automation page.** `/automation` renders `data/automation/snapshot.json`, a committed snapshot that `npm run automation:snapshot` writes from the local discovery store. The site never reads the store itself: `.evidence-mcp/` is gitignored, absent from any deployment, and would require a server to read. Publishing is therefore an explicit step, and the page shows the snapshot's `generated_at` so a reader can tell how old the view is.

What the page shows: totals for leads stored, awaiting triage, and without a fetched page; the newest leads (the first ten, the rest folded) with the page the tool actually fetched, its HTTP status, and whether a content hash was recorded; leads per adapter, per query, and per day, each with a bar relative to the largest count in its table; retrieval failures by reason; recent runs; and the last audit reproduced rule by rule with `pass`, `fail`, and `skipped` kept distinct. A lead is labelled a lead everywhere, the boundary statement sits above the table, and the closing section lists what the page does not establish. Wording shared with the tool lives in `lib/automation-copy.ts`.

`lib/automation.ts` validates the snapshot — schema version, date shapes, unique ids, http(s) urls, and every aggregate summing to the stored total — and `npm run validate:data` runs it, so `npm run build` fails on a truncated or hand-edited snapshot instead of rendering a half-empty page.

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

**Evidence tally.** Each evidence record is drawn as one small square on the Overview and Progress pages. Color is polarity (supports, contradicts, qualifies, context); a solid fill means *accepted* and a dashed hollow square means not yet accepted. Squares are counted records, not a progress bar. Nothing on the page maps a count to a percentage.

**Charts.** The charts in `components/charts/` are built from the same marks and add no dependency; they are server components with no client JavaScript. `CapabilityBoard` (Overview) is one tile per level. `EvidenceMix` (Overview) is a histogram of unit squares, one column per direction on a shared baseline, followed by the review-state counts; when none is accepted it says that none of the counts is a finding. `SourceBase` (Overview) draws one dot per source in a row per tier: a filled dot is not developer-affiliated, a ring is. `EvidenceKey` is the one key to the squares and is reused by the legend. Rules: a chart draws one mark per record and never scales a count to a percentage or a score; colour is never the only cue (fill, shape and text carry the same information); a record linked to several capabilities is drawn in each capability's row but counted once in `EvidenceMix`. The data comes from `evidenceByCapability`, `evidenceMix` and `sourceBase` in `lib/selectors.ts`, which return counts and units only and are tested in `lib/selectors.test.ts`.

**Assessment status chips** pair a glyph with a text label (`○ ◐ ● ◉ ✕ ◌`), so status never depends on color alone.

## 4. Data flow

```text
data/curated/records.json ─┬─> lib/data/index.ts ─> lib/selectors.ts ──> server components (pages)
   (records only)            (compose + validate)  createSelectors(ds)   │
data/capabilities.ts ───────┘                          │                 └─> components/EvidenceExplorer.tsx (client, via props)
                                                       └─> lib/gate.ts

data/i18n/*.zh.json ─> lib/records-i18n.ts (validate + localizeDataset) ─> selectorsFor("zh")

data/automation/snapshot.json ─> lib/automation.ts (validate + load) ─> app/[locale]/automation/page.tsx
```

- `data/automation/snapshot.json` is written by `npm run automation:snapshot` and read by `lib/automation.ts`. It is the only path by which automation output reaches the UI; the page is a static render of that file, with no request-time fetch.
- `lib/types.ts` mirrors [evidence-model.md](evidence-model.md) in TypeScript.
- `data/capabilities.ts` is framework content (L0–L7 definitions with stable criterion ids such as `crit-l3-2`). It is not demo data and is the source of truth for capability definitions. It carries `TAXONOMY_VERSION`; each assessment pins the version it was made under, and `data/capabilities.test.ts` fails on any edit to the definitions until the version and a content hash are updated together.
- `data/curated/records.json` holds the records the site renders and no capabilities; `lib/data/index.ts` composes it with `CAPABILITIES`, validates the result once with `expectedProvenance: "curated"`, and throws if the assessment and dataset taxonomy versions disagree. Pages import selectors from `@/lib/data` and never from a concrete dataset. See [data/README.md](../data/README.md).
- `lib/validate.ts` checks a `Dataset` at runtime and aggregates every violation into one message; `scripts/validate-data.ts` runs it as `npm run validate:data`, and `npm run build` calls that first. It exists because types only guard code compiled against them, not records loaded from JSON or a database.
- `lib/selectors.ts` exports `createSelectors(dataset)`, which builds id lookups and derived views (current assessment, history, tallies, recent activity) for whatever dataset it is given. Selectors throw on dangling references so broken data fails the build instead of rendering silently. `loadDataset` is synchronous today; a database loader will be async and will change how pages obtain their selectors.
- `lib/records-i18n.ts` validates the Chinese overlays against the dataset and produces a translated copy for a locale; `selectorsFor(locale)` memoises one selector set per locale, so a page never sees half-translated data. A stale overlay fails the build.
- `lib/labels.ts` holds display labels and date formatting (`formatDate(iso, locale)`).

## 5. Stage gate (`lib/gate.ts`)

The gate implements the checklist in [stage-taxonomy.md](stage-taxonomy.md) as a pure function of a proposal and the dataset. It is computed, never stored.

- **Leads never count as support.**
- **Developer-affiliated sources count as primary evidence of what the developer reports**, never as independent validation. Moving to `independently-reproduced` requires accepted support from an independent-tier source that is not developer-affiliated.
- Direct evidence must be **accepted** (review status) as well as primary or independent. An unreviewed or needs-follow-up record does not satisfy the check.
- Checklist items the evidence cannot establish (criterion, conditions and baseline, human intervention, counterevidence search, generalization limits) must be recorded by a person on the proposal; otherwise they are unmet.
- The **reviewer decision is always "awaiting human"**. The best possible verdict is `ready-for-review`; the UI has no control that accepts a change, and no code path promotes a proposal to an assessment.

The published dataset contains no proposals, so no page currently shows a gate checklist: the gate is exercised by `lib/gate.test.ts` and by the demo fixture, which keeps a deliberately blocked L3 proposal (`p-01`) whose only support is a developer paper with review status `needs-follow-up`.

## 6. Mapping to PRD §8 acceptance criteria
## 6. Mapping to PRD §8 acceptance criteria

| Criterion | Where it is met | Status |
| --- | --- | --- |
| Every displayed assessment links to the evidence and criteria supporting it | `/progress/[id]`: criteria with ids, cited evidence ids linking to cards, rationale, conditions, limitations | Implemented |
| Unverified or vendor-only claims cannot independently pass a stage gate | `lib/gate.ts`, shown by `GateChecklist` | Implemented in the UI logic; there is no persistence or server-side enforcement yet |
| Evidence can support, contradict, or qualify a claim | `polarity` on evidence; chips, tally, and grouped lists | Implemented |
| UI distinguishes observed facts from model-generated inference | §3 | Implemented |
| Changes preserve prior versions and a rationale | Assessment history on `/progress/[id]` | Displayed; versioning is not enforced because nothing is written yet |
| Unreviewed records are visibly labelled | Banner on every page, `Model-generated` tag on any record with `generated_by`, review chips, provenance panel | Implemented — every published evidence record is currently unreviewed |
| The interface is usable in more than one language | `/zh/…` route tree, dictionary-driven chrome, translation overlays for record and taxonomy prose | Implemented for English and Chinese |
| App builds and type-checks in a clean environment | `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` | All pass locally; `next build` re-runs lint and type checks. See §8 |

## 7. Adding or refreshing the data

1. Keep the shapes in `lib/types.ts`. If a real model needs a different shape, change `types.ts` and `docs/evidence-model.md` together.
2. Put records in the curation working copy and publish them with the tool: `npm run evidence:run -- curation` prints what the store holds, `npm run evidence:run -- publish` validates and writes `data/curated/records.json` plus `data/curated/published.json`. `provenance` must be `"curated"`, and every source needs an observed `canonical_url`, `retrieved_at`, and `content_hash` — never fill these in for a source that was not retrieved. See [Evidence automation](automation.md).
3. Keep capabilities in `data/capabilities.ts`. A taxonomy change is a versioned act: bump `TAXONOMY_VERSION`, update the hash in `data/capabilities.test.ts`, re-assess the current assessment of every capability, and update `data/i18n/capabilities.zh.json` — the overlay is checked against the data at load.
4. Translate new record prose in `data/i18n/records.zh.json` (sources, claims, evidence, assessments, events, attributions, forecasts, questions). Quotations are never translated. `lib/records-i18n.ts` refuses an entry whose record or field does not exist, and a missing translation leaves that field in English rather than breaking the page.
5. The banner in `app/[locale]/layout.tsx` describes what the dataset is: it currently says the records were assembled by an agent and are not human-reviewed. Reword it when that stops being true; do not remove it while unreviewed records are rendered.
6. Fictional records stay in `data/demo/dataset.ts` and are never loaded by a page — they exist so the validator, selectors and gate stay tested against data that is definitely not real. Validate each dataset with `expectedProvenance` set to its kind so the two cannot mix.
7. When data moves to a database, keep the selectors' contract (throw on dangling ids) and move the gate to the server so it is enforced where changes are written.

## 8. Known limitations

- Data is static and in-repo. Filters run in the browser and are reflected in the URL, but a shared link applies them after load, and search is a substring match over rendered fields — there is no index, ranking, or server-side query. The automation page is the same shape: it renders a committed snapshot, so its numbers are as old as the last publish, not live.
- The records are agent-curated and unreviewed. Publishing is a reviewed step only in the sense that a person runs it and commits the diff; nothing in the pipeline checks a single claim against a human reader, and every stage assessment is deliberately left at `unverified` or `insufficient-evidence`.
- Two resolved forecasts would be too few to calibrate, so no calibration view exists.
- Chinese coverage is structural rather than automatic: the chrome, the record prose and the whole L0–L7 taxonomy (names, descriptions, criteria, non-criteria, known bottlenecks) are translated, but a field added to the record types stays English until the overlay covers it, and quoted source text (`source_span`) is always English because it is a quotation. The allowlists in `lib/records-i18n.ts` (`TRANSLATABLE` for records, `CAPABILITY_FIELDS` for the taxonomy) are the record of what is translated.
- The gate runs in the UI layer. It demonstrates the rules but does not enforce them.
- There is no persistence, no review queue, and no authentication: nothing writes a record at request time, so the audit trail exists only as far as the dataset file. Triage decisions live in the local store (`.evidence-mcp/`), which is gitignored and never deployed, so a triaged lead still shows as untriaged on the site until the snapshot is regenerated.
- Tests cover the pure functions (`lib/gate.ts`, `lib/selectors.ts`, `lib/validate.ts`, `lib/automation.ts`, `lib/records-i18n.ts`, `lib/i18n/`) and the automation tooling. There is no browser or rendering test; UI verification is a production build plus review of the generated HTML.
- Automated checks are local only. There is no CI configuration in the repository, so lint, type checks, tests, and validation run only when someone runs them or when a deployment builds.
