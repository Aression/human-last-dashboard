import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Legend } from "@/components/Legend";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { DemoTag, ForecastChip, ModelTag } from "@/components/chips";
import { Statement } from "@/components/Statement";
import { selectorsFor } from "@/lib/data";
import { fill, getDictionary, isLocale, localePath, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/labels";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  return { title: getDictionary(raw).meta.titles.research };
}

function EvidenceLinks({
  ids,
  tone,
  locale,
  emptyLabel,
}: {
  ids: string[];
  tone: "accent" | "danger";
  locale: Locale;
  emptyLabel: string;
}) {
  if (ids.length === 0) return <span className="text-muted">{emptyLabel}</span>;
  return (
    <span className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <Link
          key={id}
          href={localePath(locale, `/evidence/${id}`)}
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

export default async function ResearchPage({ params }: Params) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const dict = getDictionary(locale);
  const { ds, capabilitiesById } = selectorsFor(locale);

  const resolved = ds.forecasts.filter((f) => f.status.startsWith("resolved"));
  const events = [...ds.events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const resolvedSentence = fill(
    resolved.length === 1 ? dict.research.resolvedForecastOne : dict.research.resolvedForecastOther,
    { count: resolved.length },
  );

  return (
    <div className="space-y-14">
      <PageHeader title={dict.research.title}>{dict.research.intro}</PageHeader>

      {/* ------------------------------------------------- attribution */}
      <section aria-labelledby="attribution" className="space-y-6">
        <SectionTitle
          id="attribution"
          title={dict.research.competingExplanations}
          aside={dict.research.groupedByEvent}
        />
        <div className="space-y-10">
          {events.map((ev) => {
            const hyps = ds.attributions.filter((a) => a.event_id === ev.id);
            return (
              <div key={ev.id} id={ev.id} className="scroll-mt-6">
                <div className="text-xs text-muted">
                  {fill(dict.research.eventMeta, {
                    date: formatDate(ev.occurred_at, locale),
                    id: ev.id,
                  })}
                </div>
                <h3 className="mt-1 text-lg">{ev.title}</h3>
                <Statement kind="fact" locale={locale} className="mt-2 max-w-2xl text-[14px] leading-6">
                  {ev.description}
                </Statement>
                <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                  {ev.capability_ids.map((cid) => {
                    const c = capabilitiesById.get(cid);
                    return (
                      <Link
                        key={cid}
                        href={localePath(locale, `/progress/${cid}`)}
                        className="underline-offset-4 hover:text-ink hover:underline"
                      >
                        {c?.level} {c?.name}
                      </Link>
                    );
                  })}
                </div>

                {hyps.length === 0 ? (
                  <p className="mt-4 max-w-2xl text-sm text-muted">{dict.research.noAttribution}</p>
                ) : (
                  <div className="mt-5 space-y-5">
                    {hyps.map((h) => (
                      <article key={h.id} className="rounded-lg border border-line bg-surface p-5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-mono text-accent">{h.id}</span>
                          <span>
                            {fill(dict.research.attributionMeta, {
                              status: dict.labels.attributionStatus[h.status],
                              level: dict.labels.confidence[h.confidence],
                            })}
                          </span>
                          {h.generated_by && <ModelTag model={h.generated_by.model} locale={locale} />}
                          {h.provenance === "demo" && <DemoTag locale={locale} />}
                        </div>
                        <Statement
                          kind="spec"
                          model={Boolean(h.generated_by)}
                          locale={locale}
                          className="mt-3 text-[15px] leading-7"
                        >
                          {h.hypothesis}
                        </Statement>
                        <p className="mt-3 text-[13px] leading-6 text-muted">
                          <span className="text-ink">{dict.research.proposedMechanism}</span>{" "}
                          {h.mechanism}
                        </p>

                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                          <div>
                            <h4 className="text-sm">{dict.research.alternatives}</h4>
                            <List items={h.alternatives} marker="marker:text-warn" />
                          </div>
                          <div>
                            <h4 className="text-sm">{dict.research.discriminatingTests}</h4>
                            <List items={h.discriminating_tests} marker="marker:text-accent" />
                          </div>
                          <div>
                            <h4 className="text-sm">{dict.research.assumptions}</h4>
                            <List items={h.assumptions} marker="marker:text-muted" />
                          </div>
                          <dl className="space-y-2 text-[13px]">
                            <div>
                              <dt className="text-muted">{dict.research.supportingEvidence}</dt>
                              <dd>
                                <EvidenceLinks
                                  ids={h.supporting_evidence_ids}
                                  tone="accent"
                                  locale={locale}
                                  emptyLabel={dict.research.noneRecorded}
                                />
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">{dict.research.counterevidence}</dt>
                              <dd>
                                <EvidenceLinks
                                  ids={h.counterevidence_ids}
                                  tone="danger"
                                  locale={locale}
                                  emptyLabel={dict.research.noneRecorded}
                                />
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
        <SectionTitle
          id="forecasts"
          title={dict.research.forecasts}
          aside={dict.research.forecastsAside}
        />
        <p className="max-w-3xl text-[13px] leading-6 text-muted">
          {resolvedSentence} {dict.research.calibration}
        </p>
        <ul className="space-y-4">
          {ds.forecasts.map((f) => (
            <li
              key={f.id}
              id={f.id}
              className="scroll-mt-6 rounded-lg border border-line bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-mono text-accent">{f.id}</span>
                <ForecastChip status={f.status} locale={locale} />
                <span>
                  {f.probability === null
                    ? dict.research.noProbability
                    : fill(dict.research.recordedProbability, {
                        percent: Math.round(f.probability * 100),
                      })}
                </span>
                {f.provenance === "demo" && <DemoTag locale={locale} />}
              </div>
              <Statement kind="forecast" locale={locale} className="mt-3 text-[15px] leading-7">
                {f.statement}
              </Statement>
              <dl className="mt-4 grid gap-4 text-[13px] leading-6 md:grid-cols-2">
                <div>
                  <dt className="text-muted">{dict.research.resolvesBy}</dt>
                  <dd>{formatDate(f.resolution_date, locale)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{dict.research.created}</dt>
                  <dd>{formatDate(f.created_at, locale)}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-muted">{dict.research.resolutionCriteria}</dt>
                  <dd>{f.resolution_criteria}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-muted">{dict.research.rationale}</dt>
                  <dd>{f.rationale}</dd>
                </div>
                {f.resolution_notes && (
                  <div className="md:col-span-2">
                    <dt className="text-muted">
                      {fill(dict.research.resolution, { date: formatDate(f.resolved_at, locale) })}
                    </dt>
                    <dd>{f.resolution_notes}</dd>
                  </div>
                )}
                {f.evidence_ids.length > 0 && (
                  <div className="md:col-span-2">
                    <dt className="text-muted">{dict.research.evidence}</dt>
                    <dd>
                      <EvidenceLinks
                        ids={f.evidence_ids}
                        tone="accent"
                        locale={locale}
                        emptyLabel={dict.research.noneRecorded}
                      />
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
        <SectionTitle id="questions" title={dict.research.unresolvedQuestions} />
        <ul className="max-w-3xl space-y-4">
          {ds.questions.map((q) => (
            <li key={q.id}>
              <Statement kind="spec" locale={locale}>
                {q.question}
              </Statement>
              <p className="mt-1 pl-[calc(0.85rem+3px)] text-[13px] leading-6 text-muted">
                {q.blocking}{" "}
                {q.capability_ids.map((cid) => (
                  <Link
                    key={cid}
                    href={localePath(locale, `/progress/${cid}`)}
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

      <Legend locale={locale} />
    </div>
  );
}
