import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Legend } from "@/components/Legend";
import { PageHeader } from "@/components/PageHeader";
import { EvidenceSquare, StatusChip } from "@/components/chips";
import { evaluateGate } from "@/lib/gate";
import { selectorsFor } from "@/lib/data";
import { fill, getDictionary, isLocale, localePath } from "@/lib/i18n";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  return { title: getDictionary(raw).meta.titles.progress };
}

export default async function ProgressPage({ params }: Params) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const dict = getDictionary(locale);
  const { ds, currentAssessment, evidenceForCapability, proposalsFor } = selectorsFor(locale);

  return (
    <div className="space-y-10">
      <PageHeader title={dict.progress.title}>{dict.progress.intro}</PageHeader>

      <ul className="divide-y divide-line border-y border-line">
        {ds.capabilities.map((cap) => {
          const a = currentAssessment(cap.id);
          const evidence = evidenceForCapability(cap.id);
          const proposals = proposalsFor(cap.id);
          const blocked = proposals.some((p) => evaluateGate(p, ds).verdict === "blocked");
          const evidenceCount = fill(
            evidence.length === 1
              ? dict.progress.evidenceRecordsOne
              : dict.progress.evidenceRecordsOther,
            { count: evidence.length },
          );
          return (
            <li key={cap.id}>
              <Link
                href={localePath(locale, `/progress/${cap.id}`)}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 gap-y-3 px-1 py-5 transition-colors hover:bg-white/[0.03] md:grid-cols-[2.75rem_minmax(0,1.5fr)_minmax(0,1fr)_5.5rem] md:items-center md:gap-x-5"
              >
                <span className="font-mono text-sm text-accent">{cap.level}</span>

                <div className="min-w-0">
                  <div className="font-serif text-lg leading-snug">{cap.name}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
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
                </div>

                <div className="col-start-2 md:col-start-auto">
                  {evidence.length ? (
                    <>
                      <div className="flex flex-wrap gap-1.5" aria-label={evidenceCount}>
                        {evidence.map((e) => (
                          <EvidenceSquare key={e.id} e={e} locale={locale} />
                        ))}
                      </div>
                      <div className="mt-1.5 text-xs text-muted">{evidenceCount}</div>
                    </>
                  ) : (
                    <div className="text-xs text-muted">{dict.progress.noEvidenceLinked}</div>
                  )}
                </div>

                <div className="col-start-2 text-xs text-muted md:col-start-auto md:text-right">
                  {a ? fill(dict.progress.version, { version: a.version }) : dict.progress.none}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <Legend evidence locale={locale} />
    </div>
  );
}
