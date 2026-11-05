import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Legend } from "@/components/Legend";
import { PageHeader } from "@/components/PageHeader";
import { EvidenceKey } from "@/components/charts/EvidenceKey";
import { UnitStrip } from "@/components/charts/UnitStrip";
import { StatusChip } from "@/components/chips";
import { evaluateGate } from "@/lib/gate";
import { selectorsFor } from "@/lib/data";
import { fill, getDictionary, isLocale, localePath } from "@/lib/i18n";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  return { title: getDictionary(raw).meta.titles.progress };
}

/** Shared by the column header and every row so the columns line up. */
const columns =
  "grid-cols-[2.75rem_minmax(0,1fr)] md:grid-cols-[2.75rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)]";

export default async function ProgressPage({ params }: Params) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const dict = getDictionary(locale);
  const selectors = selectorsFor(locale);
  const { ds, currentAssessment, proposalsFor } = selectors;
  const rows = selectors.evidenceByCapability();

  return (
    <div className="space-y-8">
      <PageHeader title={dict.progress.title}>{dict.progress.intro}</PageHeader>

      <section aria-label={dict.progress.keyTitle} className="space-y-3">
        <EvidenceKey locale={locale} />

        <div>
          <div
            aria-hidden="true"
            className={`hidden gap-x-5 border-b border-line px-1 pb-2 text-xs text-muted md:grid ${columns}`}
          >
            <span />
            <span>{dict.progress.columnCapability}</span>
            <span>{dict.progress.columnAssessment}</span>
            <span>{dict.progress.columnEvidence}</span>
          </div>

          <ul className="divide-y divide-line border-y border-line md:border-t-0">
            {rows.map(({ capability: cap, items }) => {
              const a = currentAssessment(cap.id);
              const proposals = proposalsFor(cap.id);
              const blocked = proposals.some((p) => evaluateGate(p, ds).verdict === "blocked");
              const evidenceCount = fill(
                items.length === 1
                  ? dict.progress.evidenceRecordsOne
                  : dict.progress.evidenceRecordsOther,
                { count: items.length },
              );
              return (
                <li key={cap.id}>
                  <Link
                    href={localePath(locale, `/progress/${cap.id}`)}
                    className={`grid items-center gap-x-5 gap-y-3 px-1 py-5 transition-colors hover:bg-white/[0.03] ${columns}`}
                  >
                    <span className="font-mono text-sm text-accent">{cap.level}</span>

                    <div className="font-serif text-lg leading-snug">{cap.name}</div>

                    <div className="col-start-2 flex flex-wrap items-center gap-2 md:col-start-auto">
                      {a ? (
                        <>
                          <StatusChip status={a.status} locale={locale} />
                          <span className="text-xs text-muted">
                            {fill(dict.progress.confidence, {
                              level: dict.labels.confidence[a.confidence],
                            })}
                          </span>
                        </>
                      ) : (
                        <span className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted">
                          {dict.progress.notAssessed}
                        </span>
                      )}
                      {proposals.length > 0 && (
                        <span className="rounded-full border border-warn/40 px-2 py-0.5 text-xs text-warn">
                          {blocked
                            ? dict.progress.changeProposedBlocked
                            : dict.progress.changeProposed}
                        </span>
                      )}
                    </div>

                    <div className="col-start-2 md:col-start-auto">
                      {items.length > 0 ? (
                        <div className="flex items-center gap-3">
                          <span
                            className="w-6 shrink-0 text-right font-serif text-lg tabular-nums"
                            aria-hidden="true"
                          >
                            {items.length}
                          </span>
                          <UnitStrip items={items} locale={locale} label={evidenceCount} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted">{dict.progress.noEvidenceLinked}</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <Legend evidence collapsible locale={locale} />
    </div>
  );
}
