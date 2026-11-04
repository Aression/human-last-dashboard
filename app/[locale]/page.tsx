import Link from "next/link";
import { Legend } from "@/components/Legend";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { StatusChip } from "@/components/chips";
import {
  activeBottlenecks,
  ds,
  evidenceStats,
  pendingReviews,
  recentActivity,
} from "@/lib/data";
import { formatDate } from "@/lib/labels";

const kindMarker = {
  event: "Event",
  assessment: "Assessment",
  forecast: "Forecast",
} as const;

export default function OverviewPage() {
  const stats = evidenceStats();
  const reviews = pendingReviews();
  const activity = recentActivity(8);
  const bottlenecks = activeBottlenecks();

  const figures = [
    { value: stats.total, label: "evidence records", note: `${stats.unreviewed} not yet accepted` },
    { value: stats.claimsUnderReview, label: "claims awaiting support", note: "candidate or unsupported" },
    { value: stats.assessmentRevisions, label: "assessment revisions", note: "prior versions kept" },
    {
      value: `${stats.openForecasts} open`,
      label: "forecasts",
      note: `${stats.resolvedForecasts} resolved`,
    },
  ];

  return (
    <div className="space-y-12">
      <PageHeader title="What changed, and what it rests on">
        Each capability is assessed against written criteria and linked to the records behind it.
        Counts below describe the demonstration dataset only.
      </PageHeader>

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
          <SectionTitle id="needs-review" title="Waiting on review" aside={`${reviews.length} proposed change`} />
          {reviews.length === 0 && (
            <p className="text-sm text-muted">
              No proposed stage changes. Proposals appear here when a model or reviewer suggests a
              new status and are held until the gate is satisfied.
            </p>
          )}
          {reviews.map(({ proposal, capability, gate }) => (
            <Link
              key={proposal.id}
              href={`/progress/${capability.id}#proposal`}
              className="block rounded-lg border border-line bg-surface p-4 transition-colors hover:border-muted"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-accent">{capability.level}</span>
                <span>{capability.name}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <StatusChip status={proposal.from_status} />
                <span aria-label="proposed change to">→</span>
                <StatusChip status={proposal.to_status} />
              </div>
              <p className="mt-3 text-[13px] leading-5 text-danger">
                {gate.verdict === "blocked"
                  ? `Blocked: ${gate.blockers[0] ?? "gate not satisfied"}`
                  : "Ready for human review."}
              </p>
            </Link>
          ))}

          <SectionTitle title="Bottlenecks in view" aside="from capability criteria" />
          <ul className="space-y-2 text-[13px]">
            {bottlenecks.map(({ capability, bottleneck }) => (
              <li key={`${capability.id}-${bottleneck}`} className="flex gap-3">
                <Link
                  href={`/progress/${capability.id}`}
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
          <SectionTitle id="recent" title="Recent changes" aside="newest first" />
          <ol className="relative space-y-5 border-l border-line pl-5">
            {activity.map((a) => (
              <li key={`${a.kind}-${a.title}-${a.date}`} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[25px] top-2 size-2 rounded-full bg-line ring-4 ring-background"
                />
                <div className="text-xs text-muted">
                  {formatDate(a.date)} · {kindMarker[a.kind]}
                </div>
                <Link href={a.href} className="mt-0.5 block text-sm hover:underline underline-offset-4">
                  {a.title}
                </Link>
                <p className="mt-0.5 text-[13px] leading-5 text-muted">{a.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Legend evidence />

      <p className="max-w-3xl text-[13px] leading-6 text-muted">
        {ds.capabilities.length} capabilities are defined; capabilities without an assessment are
        shown as not assessed on the{" "}
        <Link href="/progress" className="text-ink underline underline-offset-4">
          Progress
        </Link>{" "}
        page rather than given a default score.
      </p>
    </div>
  );
}
