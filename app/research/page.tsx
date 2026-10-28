import type { Metadata } from "next";
import Link from "next/link";
import { Legend } from "@/components/Legend";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { DemoTag, ForecastChip, ModelTag } from "@/components/chips";
import { Statement } from "@/components/Statement";
import { formatDate } from "@/lib/labels";
import { capabilitiesById, ds } from "@/lib/selectors";

export const metadata: Metadata = { title: "Research & Attribution" };

function EvidenceLinks({ ids, tone }: { ids: string[]; tone: "accent" | "danger" }) {
  if (ids.length === 0) return <span className="text-muted">None recorded</span>;
  return (
    <span className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <Link
          key={id}
          href={`/evidence/${id}`}
          className={`font-mono text-xs hover:underline ${tone === "accent" ? "text-accent" : "text-danger"}`}
        >
          {id}
        </Link>
      ))}
    </span>
  );
}

function List({ items, marker }: { items: string[]; marker: string }) {
  return (
    <ul className={`mt-1 list-disc space-y-1 pl-5 text-[13px] leading-6 ${marker}`}>
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export default function ResearchPage() {
  const resolved = ds.forecasts.filter((f) => f.status.startsWith("resolved"));
  const events = [...ds.events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  return (
    <div className="space-y-14">
      <PageHeader title="Research & Attribution">
        For each observed change, the explanations that could account for it, what would tell them
        apart, and what remains unresolved. A hypothesis stays a hypothesis until the evidence can
        separate it from its alternatives.
      </PageHeader>

      {/* ------------------------------------------------- attribution */}
      <section aria-labelledby="attribution" className="space-y-6">
        <SectionTitle id="attribution" title="Competing explanations" aside="grouped by observed event" />
        <div className="space-y-10">
          {events.map((ev) => {
            const hyps = ds.attributions.filter((a) => a.event_id === ev.id);
            return (
              <div key={ev.id} id={ev.id} className="scroll-mt-6">
                <div className="text-xs text-muted">{formatDate(ev.occurred_at)} · event {ev.id}</div>
                <h3 className="mt-1 text-lg">{ev.title}</h3>
                <Statement kind="fact" className="mt-2 max-w-2xl text-[14px] leading-6">
                  {ev.description}
                </Statement>
                <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                  {ev.capability_ids.map((cid) => {
                    const c = capabilitiesById.get(cid);
                    return (
                      <Link key={cid} href={`/progress/${cid}`} className="underline-offset-4 hover:text-ink hover:underline">
                        {c?.level} {c?.name}
                      </Link>
                    );
                  })}
                </div>

                {hyps.length === 0 ? (
                  <p className="mt-4 max-w-2xl text-sm text-muted">
                    No attribution has been proposed for this event. Absence of a hypothesis is not
                    a finding that no cause exists.
                  </p>
                ) : (
                  <div className="mt-5 space-y-5">
                    {hyps.map((h) => (
                      <article key={h.id} className="rounded-lg border border-line bg-surface p-5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-mono text-accent">{h.id}</span>
                          <span>
                            {h.status} · {h.confidence} confidence
                          </span>
                          {h.generated_by && <ModelTag model={h.generated_by.model} />}
                          {h.provenance === "demo" && <DemoTag />}
                        </div>
                        <Statement kind="spec" model={Boolean(h.generated_by)} className="mt-3 text-[15px] leading-7">
                          {h.hypothesis}
                        </Statement>
                        <p className="mt-3 text-[13px] leading-6 text-muted">
                          <span className="text-ink">Proposed mechanism.</span> {h.mechanism}
                        </p>

                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                          <div>
                            <h4 className="text-sm">Alternative explanations</h4>
                            <List items={h.alternatives} marker="marker:text-warn" />
                          </div>
                          <div>
                            <h4 className="text-sm">What would tell them apart</h4>
                            <List items={h.discriminating_tests} marker="marker:text-accent" />
                          </div>
                          <div>
                            <h4 className="text-sm">Assumptions</h4>
                            <List items={h.assumptions} marker="marker:text-muted" />
                          </div>
                          <dl className="space-y-2 text-[13px]">
                            <div>
                              <dt className="text-muted">Supporting evidence</dt>
                              <dd>
                                <EvidenceLinks ids={h.supporting_evidence_ids} tone="accent" />
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">Counterevidence</dt>
                              <dd>
                                <EvidenceLinks ids={h.counterevidence_ids} tone="danger" />
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------- forecasts */}
      <section aria-labelledby="forecasts" className="space-y-5">
        <SectionTitle id="forecasts" title="Forecasts" aside="original wording is never edited" />
        <p className="max-w-3xl text-[13px] leading-6 text-muted">
          {resolved.length} resolved forecast{resolved.length === 1 ? "" : "s"}. That is too few to
          evaluate calibration, so no score is shown. A calibration measure would appear here once
          enough forecasts have resolved.
        </p>
        <ul className="space-y-4">
          {ds.forecasts.map((f) => (
            <li key={f.id} id={f.id} className="scroll-mt-6 rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-mono text-accent">{f.id}</span>
                <ForecastChip status={f.status} />
                <span>
                  {f.probability === null
                    ? "No probability recorded"
                    : `Recorded probability ${Math.round(f.probability * 100)}%`}
                </span>
                {f.provenance === "demo" && <DemoTag />}
              </div>
              <Statement kind="forecast" className="mt-3 text-[15px] leading-7">
                {f.statement}
              </Statement>
              <dl className="mt-4 grid gap-4 text-[13px] leading-6 md:grid-cols-2">
                <div>
                  <dt className="text-muted">Resolves by</dt>
                  <dd>{formatDate(f.resolution_date)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Created</dt>
                  <dd>{formatDate(f.created_at)}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-muted">Resolution criteria, fixed in advance</dt>
                  <dd>{f.resolution_criteria}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-muted">Rationale</dt>
                  <dd>{f.rationale}</dd>
                </div>
                {f.resolution_notes && (
                  <div className="md:col-span-2">
                    <dt className="text-muted">Resolution, {formatDate(f.resolved_at)}</dt>
                    <dd>{f.resolution_notes}</dd>
                  </div>
                )}
                {f.evidence_ids.length > 0 && (
                  <div className="md:col-span-2">
                    <dt className="text-muted">Evidence</dt>
                    <dd>
                      <EvidenceLinks ids={f.evidence_ids} tone="accent" />
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------- questions */}
      <section aria-labelledby="questions" className="space-y-4">
        <SectionTitle id="questions" title="Unresolved questions" />
        <ul className="max-w-3xl space-y-4">
          {ds.questions.map((q) => (
            <li key={q.id}>
              <Statement kind="spec">{q.question}</Statement>
              <p className="mt-1 pl-[calc(0.85rem+3px)] text-[13px] leading-6 text-muted">
                {q.blocking}{" "}
                {q.capability_ids.map((cid) => (
                  <Link
                    key={cid}
                    href={`/progress/${cid}`}
                    className="font-mono text-xs text-accent hover:underline"
                  >
                    {capabilitiesById.get(cid)?.level}
                  </Link>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <Legend />
    </div>
  );
}
