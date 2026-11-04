import type { Metadata } from "next";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import {
  candidateStatusLabel,
  loadAutomationSnapshot,
  skippedChecks,
  statusCount,
} from "@/lib/automation";
import { AUTOMATION_LIMITS, DISCOVERED_LEAD_NOTE } from "@/lib/automation-copy";
import { formatDate } from "@/lib/labels";

export const metadata: Metadata = { title: "Automation" };

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs leading-5 whitespace-nowrap";

function percent(count: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

export default function AutomationPage() {
  const snapshot = loadAutomationSnapshot();
  const { candidates, audit, store } = snapshot;
  const items = candidates.items;
  const maxDay = Math.max(...candidates.by_day.map((day) => day.count), 1);
  const skipped = skippedChecks(audit);
  const newest = statusCount(snapshot, "new");
  const triaged = candidates.total - newest;
  const withHash = candidates.retrieval.with_content_hash;

  return (
    <div className="space-y-10">
      <PageHeader title="Automation intake">
        A local agent maintains two continuous jobs against this repository: discovery, which scans
        arXiv, GitHub and a handful of research feeds for candidate sources, and a dataset audit,
        which checks the dashboard records. This page shows what they last produced. It is the only
        place in the dashboard where unreviewed material appears, and it appears as leads.
      </PageHeader>

      <div className="max-w-3xl border-l-2 border-warn bg-white/[0.02] px-4 py-3">
        <p className="text-sm leading-6 text-warn">Discovered leads are not evidence.</p>
        <p className="mt-1 text-[13px] leading-6 text-muted">{DISCOVERED_LEAD_NOTE}</p>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-line border-y border-line lg:grid-cols-4">
        {[
          { value: String(candidates.total), label: "leads stored", note: `${items.length} shown below` },
          { value: String(newest), label: "awaiting triage", note: triaged === 0 ? "none triaged yet" : `${triaged} triaged` },
          { value: String(candidates.retrieval.fetch_errors), label: "without a fetched page", note: `${withHash} have a content hash` },
          {
            value: audit ? String(audit.counts.total) : "—",
            label: "audit findings",
            note: audit
              ? `${audit.counts.error} error · ${audit.counts.warn} warn · ${audit.counts.info} info`
              : "no audit yet",
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
        Snapshot generated <time dateTime={snapshot.generated_at}>{snapshot.generated_at}</time> by{" "}
        <span className="font-mono">{snapshot.generated_by}</span>. The tool runs every six hours
        (discovery) and daily (audit) on the machine that holds the store; {store.runs} runs are on
        record, {store.discovery_runs} of them discovery and {store.quality_runs} audit. The numbers
        on this page stop moving until that snapshot is published and committed.
      </p>

      <section aria-labelledby="leads" className="space-y-4">
        <SectionTitle
          id="leads"
          title="Leads, newest first"
          aside={`${items.length} of ${candidates.total} · ${items.filter((item) => item.content_hash).length} with fetched bytes`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left text-[13px]">
            <caption className="sr-only">
              Discovered candidate sources with the retrieval facts observed for each.
            </caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">Source</th>
                <th scope="col" className="py-2 pr-4 font-normal">Published</th>
                <th scope="col" className="py-2 pr-4 font-normal">Found via</th>
                <th scope="col" className="py-2 pr-4 font-normal">Retrieved</th>
                <th scope="col" className="py-2 font-normal">Status</th>
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
                      {lead.note ? ` · ${lead.note}` : ""}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted">
                    {lead.published_at ? formatDate(lead.published_at) : "not recorded"}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted">
                    <span className="font-mono text-xs">{lead.adapter}</span>
                    <div className="text-xs text-muted/80">{lead.query_id}</div>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-muted">
                    {lead.http_status === null ? "no response" : `HTTP ${lead.http_status}`}
                    <div className="text-muted/80">
                      {lead.content_hash ? `sha256 ${lead.content_hash.slice(0, 8)}…` : "no hash"}
                    </div>
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`${chip} ${
                        lead.status === "new" ? "border-dashed border-warn/40 text-warn" : "border-line text-muted"
                      }`}
                    >
                      {candidateStatusLabel[lead.status]}
                    </span>
                    <div className="mt-1 text-xs text-muted/80">
                      found {formatDate(lead.created_at)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-6 text-muted">
          Every row links to the page the tool fetched. A row with a non-200 status stores the error
          that was observed and no summary was taken from the error page, so the title is what the
          feed or API reported, not what the page says.
        </p>
      </section>

      <div className="grid gap-10 xl:grid-cols-2">
        <section aria-labelledby="sources" className="space-y-4">
          <SectionTitle id="sources" title="Where leads come from" aside={`${candidates.total} stored`} />
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">Leads per adapter and per configured query.</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">Adapter</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Leads</th>
                <th scope="col" className="py-2 text-right font-normal">Share</th>
              </tr>
            </thead>
            <tbody>
              {candidates.by_adapter.map((row) => (
                <tr key={row.adapter} className="border-b border-line/60">
                  <td className="py-2 pr-4 font-mono text-xs">{row.adapter}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.count}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{percent(row.count, candidates.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">Leads per configured discovery query.</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">Query</th>
                <th scope="col" className="py-2 text-right font-normal">Leads</th>
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
              <SectionTitle title="Why a lead has no usable page" aside={`${candidates.retrieval.fetch_errors} of ${candidates.total}`} />
              <ul className="space-y-1.5 text-[13px]">
                {candidates.retrieval.by_reason.map((row) => (
                  <li key={row.reason} className="flex justify-between gap-4 border-b border-line/60 pb-1.5">
                    <span className="text-muted">{row.reason}</span>
                    <span className="tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="intake" className="space-y-4">
          <SectionTitle id="intake" title="Intake per day" aside="UTC dates, from the stored records" />
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">Leads stored per calendar day.</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">Date</th>
                <th scope="col" className="py-2 pr-4 font-normal">Leads</th>
                <th scope="col" className="py-2 font-normal">Relative</th>
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

          <SectionTitle title="Recent runs" aside={`${snapshot.runs.length} of ${store.runs}`} />
          <ol className="space-y-1.5 text-[13px]">
            {snapshot.runs.map((run) => (
              <li key={run.run_id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line/60 pb-1.5">
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
          title="Last dataset audit"
          aside={audit ? `${audit.counts.total} finding(s) · ${audit.inspected_total} subject(s) inspected` : "no audit yet"}
        />
        {audit ? (
          <>
            <p className="text-xs leading-6 text-muted">
              Run <span className="font-mono">{audit.run_id}</span>,{" "}
              <time dateTime={audit.finished_at}>{audit.finished_at}</time>. A rule that inspected
              zero subjects is reported as skipped; a skipped check is not a pass.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-[13px]">
                <caption className="sr-only">Audit rules with findings and subjects inspected.</caption>
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th scope="col" className="py-2 pr-4 font-normal">Rule</th>
                    <th scope="col" className="py-2 pr-4 font-normal">Result</th>
                    <th scope="col" className="py-2 pr-4 text-right font-normal">Findings</th>
                    <th scope="col" className="py-2 text-right font-normal">Inspected</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.checks.map((check) => {
                    const state = check.inspected === 0 ? "skipped" : check.ok ? "pass" : "fail";
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
                          <span className={`${chip} ${cls}`}>{state}</span>
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
                Skipped ({skipped.length}): {skipped.map((check) => check.rule).join(", ")} — nothing
                of that kind exists in the dataset to check.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            No audit run has been stored yet. Run{" "}
            <span className="font-mono text-xs">npm run evidence:run -- audit</span> to produce one.
          </p>
        )}
      </section>

      <section aria-labelledby="limits" className="space-y-3">
        <SectionTitle id="limits" title="What this page does not establish" />
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[13px] leading-6 text-muted">
          {AUTOMATION_LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
        <p className="max-w-3xl text-[13px] leading-6 text-muted">
          The tool itself is documented in{" "}
          <a
            href="https://github.com/Aression/human-last-dashboard/blob/main/docs/automation.md"
            rel="noopener noreferrer"
            className="text-ink underline underline-offset-4"
          >
            docs/automation.md
          </a>
          . Its store lives outside the repository and is never deployed.
        </p>
      </section>
    </div>
  );
}
