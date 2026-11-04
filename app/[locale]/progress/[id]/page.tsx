import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceCard } from "@/components/EvidenceCard";
import { GateChecklist } from "@/components/GateChecklist";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { DemoTag, ModelTag, StatusChip } from "@/components/chips";
import { Statement } from "@/components/Statement";
import { evaluateGate } from "@/lib/gate";
import { selectorsFor } from "@/lib/data";
import { fill, getDictionary, isLocale, locales, localePath } from "@/lib/i18n";
import { formatDate } from "@/lib/labels";

type Params = { locale: string; id: string };

/** One prerendered page per capability, for each locale. */
export function generateStaticParams(): Params[] {
  return locales.flatMap((locale) =>
    selectorsFor(locale).ds.capabilities.map((c) => ({ locale, id: c.id })),
  );
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) return {};
  const cap = selectorsFor(raw).capabilitiesById.get(id);
  return { title: cap ? `${cap.level} ${cap.name}` : getDictionary(raw).meta.titles.capability };
}

export default async function CapabilityPage({ params }: { params: Promise<Params> }) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const dict = getDictionary(locale);
  const {
    ds,
    assessmentHistory,
    capabilitiesById,
    evidenceById,
    evidenceForCapability,
    proposalsFor,
    sourceOf,
  } = selectorsFor(locale);

  const cap = capabilitiesById.get(id);
  if (!cap) notFound();

  const history = assessmentHistory(cap.id);
  const current = history[0] ?? null;
  const evidence = evidenceForCapability(cap.id);
  const proposals = proposalsFor(cap.id);

  const citedByCurrent = new Set([
    ...(current?.supporting_evidence_ids ?? []),
    ...(current?.counterevidence_ids ?? []),
  ]);
  const supporting = evidence.filter((e) => e.polarity === "supports");
  const against = evidence.filter((e) => e.polarity === "contradicts" || e.polarity === "qualifies");
  const context = evidence.filter((e) => e.polarity === "contextualizes");

  return (
    <div className="space-y-12">
      <div>
        <Link
          href={localePath(locale, "/progress")}
          className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {dict.capability.backToAll}
        </Link>
        <div className="mt-4">
          <PageHeader title={`${cap.level} · ${cap.name}`}>{cap.description}</PageHeader>
        </div>
      </div>

      {/* ---------------------------------------------------- criteria */}
      <section aria-labelledby="criteria" className="grid gap-8 md:grid-cols-2">
        <div>
          <SectionTitle id="criteria" title={dict.capability.passCriteria} />
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-6 marker:text-accent">
            {cap.criteria.map((c) => (
              <li key={c.id}>
                {c.text} <span className="font-mono text-[11px] text-muted">{c.id}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle title={dict.capability.nonCriteria} />
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-6 text-muted marker:text-danger">
            {cap.nonCriteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {cap.knownBottlenecks.length > 0 && (
            <>
              <h3 className="mt-6 text-sm">{dict.capability.knownBottlenecks}</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-6 text-muted marker:text-warn">
                {cap.knownBottlenecks.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* ---------------------------------------------- current assessment */}
      <section aria-labelledby="assessment" className="space-y-4">
        <SectionTitle
          id="assessment"
          title={dict.capability.currentAssessment}
          aside={
            current
              ? fill(dict.capability.assessmentAside, {
                  version: current.version,
                  date: formatDate(current.reviewed_at, locale),
                })
              : undefined
          }
        />
        {current ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={current.status} locale={locale} />
              <span className="text-sm text-muted">
                {fill(dict.progress.confidence, {
                  level: dict.labels.confidence[current.confidence],
                })}
              </span>
              {current.provenance === "demo" && <DemoTag locale={locale} />}
            </div>
            <Statement kind="interp" locale={locale} className="max-w-3xl text-[15px] leading-7">
              {current.rationale}
            </Statement>
            <dl className="grid max-w-3xl gap-4 text-[13px] leading-6 sm:grid-cols-2">
              <div>
                <dt className="text-muted">{dict.capability.conditions}</dt>
                <dd>{current.conditions}</dd>
              </div>
              <div>
                <dt className="text-muted">{dict.capability.limitations}</dt>
                <dd>{current.limitations}</dd>
              </div>
              <div>
                <dt className="text-muted">{dict.capability.supportingEvidence}</dt>
                <dd className="flex flex-wrap gap-2">
                  {current.supporting_evidence_ids.length
                    ? current.supporting_evidence_ids.map((eid) => (
                        <Link
                          key={eid}
                          href={`#${eid}`}
                          className="font-mono text-xs text-accent hover:underline"
                        >
                          {eid}
                        </Link>
                      ))
                    : dict.capability.noneCited}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{dict.capability.counterevidence}</dt>
                <dd className="flex flex-wrap gap-2">
                  {current.counterevidence_ids.length
                    ? current.counterevidence_ids.map((eid) => (
                        <Link
                          key={eid}
                          href={`#${eid}`}
                          className="font-mono text-xs text-danger hover:underline"
                        >
                          {eid}
                        </Link>
                      ))
                    : dict.capability.noneCited}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="max-w-2xl text-sm leading-6 text-muted">{dict.capability.notAssessed}</p>
        )}
      </section>

      {/* ------------------------------------------------------ proposal */}
      {proposals.map((p) => {
        const gate = evaluateGate(p, ds);
        return (
          <section
            key={p.id}
            id="proposal"
            aria-labelledby={`prop-${p.id}`}
            className="scroll-mt-6 space-y-4"
          >
            <SectionTitle
              id={`prop-${p.id}`}
              title={dict.capability.proposedChange}
              aside={p.id}
            />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusChip status={p.from_status} locale={locale} />
              <span aria-label={dict.capability.proposedChange}>→</span>
              <StatusChip status={p.to_status} locale={locale} />
              {p.generated_by && <ModelTag model={p.generated_by.model} locale={locale} />}
              {p.provenance === "demo" && <DemoTag locale={locale} />}
            </div>
            <Statement
              kind="interp"
              model={Boolean(p.generated_by)}
              locale={locale}
              className="max-w-3xl text-[15px] leading-7"
            >
              {p.rationale}
            </Statement>
            <div className="max-w-3xl">
              <GateChecklist gate={gate} locale={locale} />
            </div>
          </section>
        );
      })}

      {/* ------------------------------------------------------ evidence */}
      <section aria-labelledby="evidence" className="space-y-6">
        <SectionTitle
          id="evidence"
          title={dict.capability.linkedEvidence}
          aside={fill(
            evidence.length === 1
              ? dict.capability.linkedEvidenceOne
              : dict.capability.linkedEvidenceOther,
            { count: evidence.length },
          )}
        />
        {evidence.length === 0 && <p className="text-sm text-muted">{dict.capability.noEvidence}</p>}
        {[
          { title: dict.capability.groupSupports, items: supporting },
          { title: dict.capability.groupAgainst, items: against },
          { title: dict.capability.groupContext, items: context },
        ]
          .filter((g) => g.items.length)
          .map((g) => (
            <div key={g.title} className="space-y-3">
              <h3 className="text-sm text-muted">{g.title}</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {g.items.map((e) => (
                  <div key={e.id}>
                    <EvidenceCard e={e} source={sourceOf(e)} locale={locale} />
                    {!citedByCurrent.has(e.id) && (
                      <p className="mt-1 px-1 text-xs text-muted">
                        {dict.capability.notCitedByCurrent}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
      </section>

      {/* ------------------------------------------------------ history */}
      {history.length > 0 && (
        <section aria-labelledby="history" className="space-y-4">
          <SectionTitle
            id="history"
            title={dict.capability.history}
            aside={dict.capability.historyAside}
          />
          <ol className="max-w-3xl space-y-3">
            {history.map((a) => {
              const prev = a.supersedes_assessment_id
                ? history.find((h) => h.id === a.supersedes_assessment_id)
                : null;
              return (
                <li key={a.id}>
                  <details
                    className="reveal-details rounded-lg border border-line bg-surface"
                    open={a === history[0] ? false : undefined}
                  >
                    <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                      <span className="font-mono text-xs text-muted">
                        {fill(dict.capability.versionNumber, { version: a.version })}
                      </span>
                      <StatusChip status={a.status} locale={locale} />
                      <span className="text-xs text-muted">
                        {fill(dict.capability.historyMeta, {
                          date: formatDate(a.reviewed_at, locale),
                          reviewer: a.reviewer,
                        })}
                        {prev
                          ? fill(dict.capability.fromVersion, { version: prev.version })
                          : dict.capability.firstVersion}
                      </span>
                    </summary>
                    <div className="reveal-body space-y-2 border-t border-line px-4 py-3 text-[13px] leading-6">
                      <p>{a.rationale}</p>
                      <p className="text-muted">
                        {fill(dict.capability.cited, {
                          ids:
                            [...a.supporting_evidence_ids, ...a.counterevidence_ids]
                              .filter((eid) => evidenceById.has(eid))
                              .join(", ") || dict.capability.noEvidenceCited,
                        })}
                      </p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
