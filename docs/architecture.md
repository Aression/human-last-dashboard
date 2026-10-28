# Architecture

## 1. Current scaffold

The repository is a Next.js App Router application with TypeScript and Tailwind CSS. The UI renders a clearly labeled, fictional demonstration dataset held in the repository; no ingestion, persistence, or model calls exist. Routes, components, data flow, and the client-side stage gate are described in [frontend.md](frontend.md).

## 2. Logical components

1. **Source adapters** — retrieve metadata and content from approved sources such as papers, technical reports, benchmark pages, GitHub repositories, and official announcements.
2. **Raw-source archive** — retain canonical URL, retrieval time, content hash, metadata, and an immutable or versioned snapshot where licensing and policy permit.
3. **Extraction pipeline** — generate candidate entities and claims in a structured schema with source spans or exact supporting passages.
4. **Verification pipeline** — validate source support, check dates and context, identify duplicates, and find independent evaluation or counterevidence.
5. **Assessment engine** — map accepted evidence to explicit capability criteria and produce a proposed assessment, rationale, uncertainty, and unresolved gaps.
6. **Review gate** — require configured review for stage changes and preserve an audit trail.
7. **Application API** — serve filtered records and submit review actions.
8. **Dashboard** — visualize evidence, assessment history, attribution hypotheses, and forecast calibration.

## 3. Suggested deployment stack

- Next.js App Router + TypeScript + Tailwind CSS.
- PostgreSQL for relational records and full-text search initially.
- Optional object storage for source snapshots and extracted artifacts.
- A server-side model adapter supporting structured output and explicit model/version metadata.
- Vercel for the frontend and short request handlers.
- A durable job runner or queue for long-running workflows, retries, backoff, cancellation, and resumable progress.

Do not assume a serverless request is suitable for an entire research run. The web layer should enqueue work and expose job status. Choose a durable workflow service only after the expected job duration, throughput, and cost are known.

## 4. Data flow

```text
Sources
  -> Capture and archive
  -> Candidate claims
  -> Source-support verification
  -> Independent evidence and counterevidence
  -> Capability mapping
  -> Assessment proposal
  -> Review gate
  -> Versioned assessment
  -> Dashboard and reports
```

## 5. Reliability and safety

- Every generated record stores the model/provider and prompt or workflow version where applicable.
- Preserve original source timestamps separately from retrieval timestamps.
- Use idempotency keys for source ingestion and job retries.
- Make extraction and assessment jobs resumable.
- Apply rate limits and per-source budgets.
- Treat source text as untrusted input; it must never override system or developer instructions.
- Never let a model-generated claim self-verify.
- Keep secrets in environment variables and out of browser bundles.
- Use explicit status transitions and audit records for reviewer actions.

## 6. Initial implementation order

1. Static dashboard and docs. *(Done: four views plus detail pages over demo data; see [frontend.md](frontend.md).)*
2. Typed domain schemas and database migration. *(TypeScript types exist in `lib/types.ts`; no database migration yet.)*
3. Manual source/claim/evidence entry.
4. Search and provenance views.
5. Assisted extraction with validation.
6. Counterevidence discovery and review queue.
7. Versioned assessments and forecast scoring.
8. Scheduled ingestion and durable workflows.
