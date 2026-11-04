import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { loadAutomationSnapshot, skippedChecks, statusCount } from "@/lib/automation";
import { automationLimits, discoveredLeadNote } from "@/lib/automation-copy";
import { localizeNote, localizeReason } from "@/lib/automation";
import { fill, getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/labels";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  return { title: getDictionary(raw).meta.titles.automation };
}

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs leading-5 whitespace-nowrap";

function percent(count: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

export default async function AutomationPage({ params }: Params) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dict = getDictionary(locale);
  const copy = dict.automation;

  const snapshot = loadAutomationSnapshot();
  const { candidates, audit, store } = snapshot;
  const items = candidates.items;
  const maxDay = Math.max(...candidates.by_day.map((day) => day.count), 1);
  const skipped = skippedChecks(audit);
  const newest = statusCount(snapshot, "new");
  const triaged = candidates.total - newest;
  const withHash = candidates.retrieval.with_content_hash;
  const withBytes = items.filter((item) => item.content_hash).length;

  return (
    <div className="space-y-10">
      <PageHeader title={copy.title}>{copy.intro}</PageHeader>

      <div className="max-w-3xl border-l-2 border-warn bg-white/[0.02] px-4 py-3">
        <p className="text-sm leading-6 text-warn">{copy.leadsAreNotEvidence}</p>
        <p className="mt-1 text-[13px] leading-6 text-muted">{discoveredLeadNote(locale)}</p>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-line border-y border-line lg:grid-cols-4">
        {[
          {
            value: String(candidates.total),
            label: copy.figureLeadsStored,
            note: fill(copy.figureShownBelow, { count: items.length }),
          },
          {
            value: String(newest),
            label: copy.figureAwaitingTriage,
            note: triaged === 0 ? copy.figureNoneTriaged : fill(copy.figureTriaged, { count: triaged }),
          },
          {
            value: String(candidates.retrieval.fetch_errors),
            label: copy.figureWithoutPage,
            note: fill(copy.figureWithHash, { count: withHash }),
          },
          {
            value: audit ? String(audit.counts.total) : "—",
            label: copy.figureAuditFindings,
            note: audit
              ? fill(copy.figureAuditCounts, {
                  error: audit.counts.error,
                  warn: audit.counts.warn,
                  info: audit.counts.info,
                })
              : copy.figureNoAudit,
          },
        ].map((figure) => (
          <div key={figure.label} className="px-4 py-4 first:pl-0">
            <dt className="text-xs text-muted">{figure.label}</dt>
            <dd className="mt-1 font-serif text-3xl tabular-nums">{figure.value}</dd>
            <dd className="mt-1 text-xs text-muted">{figure.note}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs leading-6 text-muted">
        {fill(copy.snapshotNote, {
          date: snapshot.generated_at,
          by: snapshot.generated_by,
          runs: store.runs,
          discovery: store.discovery_runs,
          quality: store.quality_runs,
        })}
      </p>

      <section aria-labelledby="leads" className="space-y-4">
        <SectionTitle
          id="leads"
          title={copy.leadsTitle}
          aside={fill(copy.leadsAside, {
            shown: items.length,
            total: candidates.total,
            withBytes,
          })}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left text-[13px]">
            <caption className="sr-only">{copy.leadsCaption}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">{copy.columnSource}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{copy.columnPublished}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{copy.columnFoundVia}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{copy.columnRetrieved}</th>
                <th scope="col" className="py-2 font-normal">{copy.columnStatus}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <tr key={lead.id} className="border-b border-line/60 align-top">
                  <td className="py-2.5 pr-4">
                    <a
                      href={lead.url}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                      className="block max-w-[26rem] text-ink underline-offset-4 hover:underline"
                    >
                      {lead.title}
                    </a>
                    <div className="mt-0.5 text-xs text-muted">
                      {lead.publisher}
                      {lead.note ? ` · ${localizeNote(lead.note, locale)}` : ""}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted">
                    {lead.published_at ? formatDate(lead.published_at, locale) : copy.leadNotRecorded}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted">
                    <span className="font-mono text-xs">{lead.adapter}</span>
                    <div className="text-xs text-muted/80">{lead.query_id}</div>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-muted">
                    {lead.http_status === null
                      ? copy.leadNoResponse
                      : fill(copy.leadHttpStatus, { status: lead.http_status })}
                    <div className="text-muted/80">
                      {lead.content_hash
                        ? fill(copy.leadHash, { hash: lead.content_hash.slice(0, 8) })
                        : copy.leadNoHash}
                    </div>
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`${chip} ${
                        lead.status === "new"
                          ? "border-dashed border-warn/40 text-warn"
                          : "border-line text-muted"
                      }`}
                    >
                      {dict.labels.candidateStatus[lead.status]}
                    </span>
                    <div className="mt-1 text-xs text-muted/80">
                      {fill(copy.leadFound, { date: formatDate(lead.created_at, locale) })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-6 text-muted">{copy.tableNote}</p>
      </section>

      <div className="grid gap-10 xl:grid-cols-2">
        <section aria-labelledby="sources" className="space-y-4">
          <SectionTitle
            id="sources"
            title={copy.sourcesTitle}
            aside={fill(copy.sourcesAside, { count: candidates.total })}
          />
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">{copy.adapterCaption}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">{copy.columnAdapter}</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">{copy.columnLeads}</th>
                <th scope="col" className="py-2 text-right font-normal">{copy.columnShare}</th>
              </tr>
            </thead>
            <tbody>
              {candidates.by_adapter.map((row) => (
                <tr key={row.adapter} className="border-b border-line/60">
                  <td className="py-2 pr-4 font-mono text-xs">{row.adapter}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.count}</td>
                  <td className="py-2 text-right tabular-nums text-muted">
                    {percent(row.count, candidates.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">{copy.queryCaption}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">{copy.columnQuery}</th>
                <th scope="col" className="py-2 text-right font-normal">{copy.columnLeads}</th>
              </tr>
            </thead>
            <tbody>
              {candidates.by_query.map((row) => (
                <tr key={row.query_id} className="border-b border-line/60">
                  <td className="py-2 pr-4 font-mono text-xs">{row.query_id}</td>
                  <td className="py-2 text-right tabular-nums">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {candidates.retrieval.by_reason.length > 0 && (
            <>
              <SectionTitle
                title={copy.reasonsTitle}
                aside={fill(copy.reasonsAside, {
                  errors: candidates.retrieval.fetch_errors,
                  total: candidates.total,
                })}
              />
              <ul className="space-y-1.5 text-[13px]">
                {candidates.retrieval.by_reason.map((row) => (
                  <li
                    key={row.reason}
                    className="flex justify-between gap-4 border-b border-line/60 pb-1.5"
                  >
                    <span className="text-muted">{localizeReason(row.reason, locale)}</span>
                    <span className="tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="intake" className="space-y-4">
          <SectionTitle id="intake" title={copy.intakeTitle} aside={copy.intakeAside} />
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">{copy.dayCaption}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">{copy.columnDate}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{copy.columnLeads}</th>
                <th scope="col" className="py-2 font-normal">{copy.columnRelative}</th>
              </tr>
            </thead>
            <tbody>
              {candidates.by_day.map((day) => (
                <tr key={day.date} className="border-b border-line/60">
                  <td className="py-2 pr-4 font-mono text-xs">{day.date}</td>
                  <td className="py-2 pr-4 tabular-nums">{day.count}</td>
                  <td className="py-2">
                    <span
                      aria-hidden="true"
                      className="block h-1.5 rounded-full bg-accent/50"
                      style={{ width: `${Math.round((day.count / maxDay) * 100)}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <SectionTitle
            title={copy.runsTitle}
            aside={fill(copy.runsAside, { shown: snapshot.runs.length, total: store.runs })}
          />
          <ol className="space-y-1.5 text-[13px]">
            {snapshot.runs.map((run) => (
              <li
                key={run.run_id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line/60 pb-1.5"
              >
                <span className="font-mono text-xs text-muted">{run.run_id}</span>
                <span className={run.ok ? "text-muted" : "text-danger"}>{run.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section aria-labelledby="audit" className="space-y-4">
        <SectionTitle
          id="audit"
          title={copy.auditTitle}
          aside={
            audit
              ? fill(copy.auditAside, {
                  count: audit.counts.total,
                  subjects: audit.inspected_total,
                })
              : copy.figureNoAudit
          }
        />
        {audit ? (
          <>
            <p className="text-xs leading-6 text-muted">
              {fill(copy.auditMeta, { id: audit.run_id, time: audit.finished_at })}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-[13px]">
                <caption className="sr-only">{copy.auditCaption}</caption>
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th scope="col" className="py-2 pr-4 font-normal">{copy.columnRule}</th>
                    <th scope="col" className="py-2 pr-4 font-normal">{copy.columnResult}</th>
                    <th scope="col" className="py-2 pr-4 text-right font-normal">
                      {copy.columnFindings}
                    </th>
                    <th scope="col" className="py-2 text-right font-normal">
                      {copy.columnInspected}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {audit.checks.map((check) => {
                    const state = check.inspected === 0 ? "skipped" : check.ok ? "pass" : "fail";
                    const label =
                      state === "fail"
                        ? copy.stateFail
                        : state === "skipped"
                          ? copy.stateSkipped
                          : copy.statePass;
                    const cls =
                      state === "fail"
                        ? "border-danger/50 text-danger"
                        : state === "skipped"
                          ? "border-dashed border-line text-muted"
                          : "border-accent/40 text-accent";
                    return (
                      <tr key={check.rule} className="border-b border-line/60">
                        <td className="py-2 pr-4 font-mono text-xs">{check.rule}</td>
                        <td className="py-2 pr-4">
                          <span className={`${chip} ${cls}`}>{label}</span>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{check.findings}</td>
                        <td className="py-2 text-right tabular-nums text-muted">{check.inspected}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {skipped.length > 0 && (
              <p className="text-xs leading-6 text-muted">
                {(() => {
                  const [before, after] = copy.skippedList.split("{count}");
                  const [mid, tail] = after.split("{rules}");
                  return (
                    <>
                      {before}
                      {skipped.length}
                      {mid}
                      {skipped.map((check) => check.rule).join(", ")}
                      {tail}
                    </>
                  );
                })()}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            {(() => {
              const [before, after] = copy.noAuditBody.split("{command}");
              return (
                <>
                  {before}
                  <span className="font-mono text-xs">npm run evidence:run -- audit</span>
                  {after}
                </>
              );
            })()}
          </p>
        )}
      </section>

      <section aria-labelledby="limits" className="space-y-3">
        <SectionTitle id="limits" title={copy.limitsTitle} />
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[13px] leading-6 text-muted">
          {automationLimits(locale).map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
        <p className="max-w-3xl text-[13px] leading-6 text-muted">
          {(() => {
            const [before, after] = copy.docsNote.split("{link}");
            return (
              <>
                {before}
                <a
                  href="https://github.com/Aression/human-last-dashboard/blob/main/docs/automation.md"
                  rel="noopener noreferrer"
                  className="text-ink underline underline-offset-4"
                >
                  docs/automation.md
                </a>
                {after}
              </>
            );
          })()}
        </p>
      </section>
    </div>
  );
}
