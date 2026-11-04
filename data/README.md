# data/

Everything the dashboard renders comes from here, loaded through `lib/data/index.ts`.

| Path | Contents | Provenance rule |
| --- | --- | --- |
| `capabilities.ts` | L0–L7 definitions and `TAXONOMY_VERSION`. Framework content, not evidence. | n/a |
| `curated/records.json` | The records the site renders, assembled by the curation pipeline from fetched sources. **Agent-maintained and not human-reviewed: every evidence record is `review_status: "unreviewed"` and every assessment records that no human has reviewed it.** | Every record must be `"curated"`. |
| `curated/published.json` | What the last publish wrote: record counts per collection and the sha256 of the exact bytes. Written by the tool, never by hand. | n/a |
| `i18n/records.zh.json` | Chinese overlay for record prose, keyed by record id. Quotations (claim `source_span`) are never translated. | n/a |
| `i18n/capabilities.zh.json` | Chinese overlay for the capability taxonomy: names, descriptions, criteria and non-criteria. | n/a |
| `demo/dataset.ts` | Fictional fixture that keeps the validator, selectors and gate tested against data that is definitely not real. **The app no longer renders it.** | Every record must be `"demo"`. |
| `automation/snapshot.json` | Discovered leads the `/automation` page renders, written by `npm run automation:snapshot`. Not dataset records. | Every lead is `provenance: "discovered"`. |

Rules:

- Validate each dataset with `validateDataset(ds, { expectedProvenance })` so fictional and real records cannot share a dataset. `npm run validate:data` validates `curated/records.json` composed with `capabilities.ts`, and runs on every build.
- Do not put real records in `demo/`, and do not copy demo records into `curated/`.
- `curated/records.json` is written by the tool, not by hand: `npm run evidence:run -- curation` reads the working copy and prints what the store holds, and `npm run evidence:run -- publish` validates it and writes the file. Editing the file directly is possible but skips the provenance checks.
- A lead the automation discovered is not a record. A person or an agent turns a lead into a record through a separate, reviewed edit; the tooling cannot do it.
- Changing a criterion in `capabilities.ts` is a versioned act: bump `TAXONOMY_VERSION`, update the hash in `capabilities.test.ts`, re-assess the current assessment of every capability (the validator enforces it), and update `i18n/capabilities.zh.json` — the overlay is checked against the data when the module loads.
