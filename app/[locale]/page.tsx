import Link from "next/link";
import { notFound } from "next/navigation";
import { Legend } from "@/components/Legend";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { StatusChip } from "@/components/chips";
import { selectorsFor } from "@/lib/data";
import { fill, getDictionary, isLocale, localePath } from "@/lib/i18n";
import { formatDate } from "@/lib/labels";

const kindKey = {
  event: "kindEvent",
  assessment: "kindAssessment",
  forecast: "kindForecast",
} as const;

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const dict = getDictionary(locale);

  const selectors = selectorsFor(locale);
  const stats = selectors.evidenceStats();
  const reviews = selectors.pendingReviews();
  const activity = selectors.recentActivity(8);
  const bottlenecks = selectors.activeBottlenecks();

  const figures = [
    {
      value: stats.total,
      label: dict.overview.figureEvidenceRecords,
      note: fill(dict.overview.figureNotYetAccepted, { count: stats.unreviewed }),
    },
    {
      value: stats.claimsUnderReview,
      label: dict.overview.figureClaimsAwaitingSupport,
      note: dict.overview.figureCandidateOrUnsupported,
    },
    {
      value: stats.assessmentRevisions,
      label: dict.overview.figureAssessmentRevisions,
      note: dict.overview.figurePriorVersionsKept,
    },
    {
      value: fill(dict.overview.figureOpenForecasts, { count: stats.openForecasts }),
      label: dict.overview.figureForecasts,
      note: fill(dict.overview.figureResolvedForecasts, { count: stats.resolvedForecasts }),
    },
  ];

  return (
    <div className="space-y-12">
      <PageHeader title={dict.overview.title}>{dict.overview.intro}</PageHeader>

      <dl className="grid grid-cols-2 divide-x divide-line border-y border-line lg:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="px-4 py-4 first:pl-0">
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="mt-1 font-serif text-3xl tabular-nums">{f.value}</dd>
            <dd className="mt-1 text-xs text-muted">{f.note}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-12 xl:grid-cols-2">
        <section aria-labelledby="needs-review" className="space-y-4">
          <SectionTitle
            id="needs-review"
            title={dict.overview.waitingOnReview}
            aside={fill(dict.overview.proposedChangeCount, { count: reviews.length })}
          />
          {reviews.length === 0 && (
            <p className="text-sm text-muted">{dict.overview.noProposals}</p>
          )}
          {reviews.map(({ proposal, capability, gate }) => (
            <Link
              key={proposal.id}
              href={`${localePath(locale, `/progress/${capability.id}`)}#proposal`}
              className="block rounded-lg border border-line bg-surface p-4 transition-colors hover:border-muted"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-accent">{capability.level}</span>
                <span>{capability.name}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <StatusChip status={proposal.from_status} locale={locale} />
                <span aria-label="→">→</span>
                <StatusChip status={proposal.to_status} locale={locale} />
              </div>
              <p className="mt-3 text-[13px] leading-5 text-danger">
                {gate.verdict === "blocked"
                  ? fill(dict.overview.blocked, {
                      reason: gate.blockers[0] ?? dict.overview.gateNotSatisfied,
                    })
                  : dict.overview.readyForReview}
              </p>
            </Link>
          ))}

          <SectionTitle
            title={dict.overview.bottlenecks}
            aside={dict.overview.bottlenecksAside}
          />
          <ul className="space-y-2 text-[13px]">
            {bottlenecks.map(({ capability, bottleneck }) => (
              <li key={`${capability.id}-${bottleneck}`} className="flex gap-3">
                <Link
                  href={localePath(locale, `/progress/${capability.id}`)}
                  className="w-8 shrink-0 font-mono text-xs text-accent hover:underline"
                >
                  {capability.level}
                </Link>
                <span className="text-muted">{bottleneck}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="recent" className="space-y-4">
          <SectionTitle id="recent" title={dict.overview.recentChanges} aside={dict.overview.recentAside} />
          <ol className="relative space-y-5 border-l border-line pl-5">
            {activity.map((a) => (
              <li key={`${a.kind}-${a.title}-${a.date}`} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[25px] top-2 size-2 rounded-full bg-line ring-4 ring-background"
                />
                <div className="text-xs text-muted">
                  {formatDate(a.date, locale)} · {dict.overview[kindKey[a.kind]]}
                </div>
                <Link
                  href={localePath(locale, a.href)}
                  className="mt-0.5 block text-sm hover:underline underline-offset-4"
                >
                  {a.title}
                </Link>
                <p className="mt-0.5 text-[13px] leading-5 text-muted">{a.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Legend evidence locale={locale} />

      <p className="max-w-3xl text-[13px] leading-6 text-muted">
        {fill(dict.overview.footerLead, { count: selectors.ds.capabilities.length })}{" "}
        <Link
          href={localePath(locale, "/progress")}
          className="text-ink underline underline-offset-4"
        >
          {dict.overview.footerLink}
        </Link>{" "}
        {dict.overview.footerTail}
      </p>
    </div>
  );
}
