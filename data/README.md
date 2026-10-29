# data/

Everything the dashboard renders comes from here, loaded through `lib/data/index.ts`.

| Path | Contents | Provenance rule |
| --- | --- | --- |
| `capabilities.ts` | L0–L7 definitions and `TAXONOMY_VERSION`. Framework content, not evidence. | n/a |
| `demo/dataset.ts` | Fictional fixture that exercises the UI. | Every record must be `"demo"`. |
| `curated/` | Reviewed real records (does not exist yet). | Every record must be `"curated"`. |

Rules:

- Validate each dataset with `validateDataset(ds, { expectedProvenance })` so fictional and real records cannot share a dataset. `npm run validate:data` does this for `demo/` and runs on every build.
- Do not put real records in `demo/`, and do not copy demo records into `curated/`.
- Changing a criterion in `capabilities.ts` is a versioned act: bump `TAXONOMY_VERSION`, update the hash in `capabilities.test.ts`, and re-assess the current assessment of every capability, which the validator enforces. Definitions of superseded versions are not archived yet; git history is the only record.
