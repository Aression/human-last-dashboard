# Human's Last Dashboard

An evidence-traceable dashboard for monitoring AGI progress and recursive self-improvement.

The project is designed to answer four questions:

1. What happened?
2. What does the evidence actually establish?
3. Which capabilities and bottlenecks are changing?
4. Which conclusions are uncertain, overstated, or contradicted?

It is not a generic AI news aggregator. The core product is a versioned evidence graph that connects sources, claims, evidence, capability assessments, causal hypotheses, and forecasts.

## Principles

- **Evidence before conclusions.** Every material assessment must link to inspectable source material.
- **Separate facts from inference.** Reports distinguish observed facts, interpretation, speculation, and forecasts.
- **Counterevidence is first-class.** Significant claims should record competing explanations and disconfirming evidence.
- **No automatic stage upgrades from headlines.** A model may propose an assessment; evidence gates and review rules determine whether it is accepted.
- **Preserve history.** Assessments and forecasts are versioned so changes and calibration can be audited.
- **Show uncertainty.** Use explicit confidence and verification states rather than a single misleading AGI percentage.

## Initial capability taxonomy

L0–L7 is a project-specific working taxonomy, not an industry standard or a claim that AGI progresses along one universal ladder. Capabilities can develop asynchronously.

- **L0 — Human-led AI tools:** AI assists individual tasks under close human direction.
- **L1 — Task execution autonomy:** AI completes bounded multi-step tasks with limited intervention.
- **L2 — Research workflow autonomy:** AI executes a research loop including planning, tool use, evaluation, and reporting.
- **L3 — Improvement strategy autonomy:** AI proposes and tests strategies for improving models or research systems.
- **L4 — Autonomous data/model updating:** AI can reliably operate data or model update loops with measurable validation.
- **L5 — Autonomous improvement mechanism:** AI improves parts of the process used to improve itself, with reproducible evidence of net gains.
- **L6 — Physical R&D loop:** AI closes meaningful design, validation, and deployment loops in physical R&D, including hardware.
- **L7 — Industrial-scale recursive improvement:** sustained, compounding improvement loops operate at industrial scale under real-world constraints.

Each level must be assessed against explicit criteria, operational evidence, limitations, and counterevidence. Do not infer higher levels merely from performance at lower levels.

## Planned architecture

- Next.js + TypeScript + Tailwind for the dashboard.
- PostgreSQL for normalized records and relationships.
- A source-ingestion pipeline for papers, technical reports, benchmarks, repositories, and announcements.
- LLM-assisted extraction and analysis with structured outputs and provenance.
- Durable jobs for long-running research tasks; short serverless functions should orchestrate rather than hold long workflows open.
- Vercel for web deployment, with secrets stored only in server-side environment variables.

## Repository status

The dashboard frontend is implemented over a **fictional demonstration dataset**. It has four views (Overview, Progress, Evidence Explorer, Research & Attribution) plus capability and record detail pages. The Evidence Explorer keeps its filters in the URL, and record pages show a provenance panel that reports only what each record stores. Ingestion, persistence, model calls, authentication, and scheduled workflows are not implemented. Demo records are labeled on every page and must not be read as evidence about real systems. See [Frontend](docs/frontend.md).

A production build is deployed at https://human-last-dashboard.vercel.app; see [Deployment](docs/deployment.md).

## Development

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Validates the dataset, then builds all routes as static pages. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint over the whole repository. |
| `npm test` | Behavioural tests for `lib/gate.ts`, `lib/selectors.ts`, `lib/validate.ts`, and the pinned capability taxonomy in `data/`. |
| `npm run validate:data` | Runs `lib/validate.ts` against the demo dataset (requiring demo provenance on every record); prints counts and every violation. |

`npm run build` refuses to build a dataset whose ids, references, assessment version chains, provenance, or forecast resolutions are inconsistent.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/architecture.md)
- [Frontend](docs/frontend.md)
- [Evidence model](docs/evidence-model.md)
- [Stage taxonomy and gates](docs/stage-taxonomy.md)
- [Agent workflows](docs/agent-workflows.md)
- [Deployment](docs/deployment.md)
- [Engineering instructions](AGENTS.md)

## Scope and limitations

This project does not claim to measure a definitive AGI threshold. Its assessments are operational hypotheses grounded in available evidence and must remain revisable. Vendor announcements and social posts can create investigation leads, but cannot independently verify a capability.
