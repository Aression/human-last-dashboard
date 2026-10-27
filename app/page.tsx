const metrics = [
  { label: "Evidence records", value: "—", note: "Awaiting source ingestion" },
  { label: "Claims under review", value: "—", note: "No records loaded" },
  { label: "Assessment changes", value: "0", note: "No accepted changes yet" },
  { label: "Open forecasts", value: "0", note: "Forecast tracking not configured" },
];

const stages = [
  { level: "L0", name: "Human-led AI tools", state: "Framework defined", width: "100%" },
  { level: "L1", name: "Task execution autonomy", state: "Awaiting evidence", width: "0%" },
  { level: "L2", name: "Research workflow autonomy", state: "Awaiting evidence", width: "0%" },
  { level: "L3", name: "Improvement strategy autonomy", state: "Awaiting evidence", width: "0%" },
  { level: "L4", name: "Autonomous data/model updating", state: "Awaiting evidence", width: "0%" },
  { level: "L5", name: "Autonomous improvement mechanism", state: "Awaiting evidence", width: "0%" },
  { level: "L6", name: "Physical R&D loop", state: "Awaiting evidence", width: "0%" },
  { level: "L7", name: "Industrial-scale recursive improvement", state: "Awaiting evidence", width: "0%" },
];

const sections = [
  ["Overview", "01"],
  ["Progress", "02"],
  ["Evidence Explorer", "03"],
  ["Research & Attribution", "04"],
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="border-b border-[var(--border)] p-5 md:border-b-0 md:border-r md:p-6">
          <a href="/" className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-lg font-semibold text-[var(--accent)]">
              H/
            </div>
            <div>
              <div className="font-semibold tracking-tight">LAST DASHBOARD</div>
              <div className="text-xs text-[var(--muted)]">AGI evidence monitor</div>
            </div>
          </a>

          <div className="mt-10 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Workspace
          </div>
          <nav className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-1">
            {sections.map(([name, number], index) => (
              <a
                key={name}
                href={index === 0 ? "#overview" : index === 1 ? "#progress" : index === 2 ? "#evidence" : "#attribution"}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-white/5 ${index === 0 ? "bg-white/[0.07] text-white" : "text-[var(--muted)]"}`}
              >
                <span className="font-mono text-[10px] text-[var(--accent)]">{number}</span>
                <span>{name}</span>
              </a>
            ))}
          </nav>

          <div className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs font-semibold">Evidence policy</div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              A claim is not a finding. Every assessment must trace to inspectable evidence and disclose uncertainty.
            </p>
          </div>
          <div className="mt-6 text-[11px] text-[var(--muted)]">INITIAL SCAFFOLD · v0.1.0</div>
        </aside>

        <div className="min-w-0">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4 md:px-9">
            <div>
              <div className="text-xs text-[var(--muted)]">RESEARCH INTELLIGENCE / OVERVIEW</div>
              <div className="mt-1 text-sm">Evidence before conclusions.</div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-1.5 text-xs text-[var(--warning)]">
              <span className="size-1.5 rounded-full bg-[var(--warning)]" />
              Demo mode · no live data
            </div>
          </header>

          <div className="space-y-8 p-5 md:p-9">
            <section id="overview">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent)]">Monitoring system</div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">The state of AI progress</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                    Track demonstrated capabilities, audit the evidence behind claims, and examine whether recursive improvement is becoming operational.
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                  Assessment framework <span className="ml-2 font-mono text-[var(--text)]">L0—L7</span>
                </div>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="text-xs text-[var(--muted)]">{metric.label}</div>
                    <div className="mt-3 text-2xl font-semibold tracking-tight">{metric.value}</div>
                    <div className="mt-2 text-xs text-[var(--muted)]">{metric.note}</div>
                  </div>
                ))}
              </div>
            </section>

            <section id="progress" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Recursive improvement framework</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">Capability taxonomy · not a universal AGI scale</p>
                </div>
                <span className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">Evidence pending</span>
              </div>
              <div className="mt-6 space-y-4">
                {stages.map((stage) => (
                  <div key={stage.level} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
                    <div className="pt-0.5 font-mono text-xs text-[var(--accent)]">{stage.level}</div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm">{stage.name}</div>
                        <div className="text-[11px] text-[var(--muted)]">{stage.state}</div>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: stage.width }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs leading-5 text-[var(--muted)]">
                No level is marked as achieved by this scaffold. Each future assessment must be supported by traceable evidence, explicit criteria, operating conditions, and counterevidence.
              </p>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <section id="evidence" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Evidence ledger</h2>
                  <span className="font-mono text-xs text-[var(--muted)]">00 RECORDS</span>
                </div>
                <div className="mt-5 rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center">
                  <div className="text-sm">No evidence ingested yet</div>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[var(--muted)]">
                    The first milestone is a source registry that preserves original references and separates claims from verified observations.
                  </p>
                </div>
              </section>

              <section id="attribution" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Research & attribution</h2>
                  <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] text-[var(--muted)]">NOT CONFIGURED</span>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    ["Evidence capture", "Preserve sources, dates, versions, and content hashes."],
                    ["Counterevidence", "Search for independent replication, failures, and competing explanations."],
                    ["Assessment gate", "Require explicit criteria and review before changing accepted status."],
                  ].map(([title, description], index) => (
                    <div key={title} className="flex gap-3 rounded-lg border border-[var(--border)] p-3">
                      <div className="grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.05] font-mono text-xs text-[var(--accent)]">0{index + 1}</div>
                      <div>
                        <div className="text-sm font-medium">{title}</div>
                        <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <footer className="flex flex-wrap justify-between gap-2 border-t border-[var(--border)] pt-4 text-[11px] text-[var(--muted)]">
              <span>Human’s Last Dashboard · Evidence-traceable AI progress monitoring</span>
              <span>Static scaffold · no live claims or assessments</span>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
