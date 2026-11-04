import type { Metadata } from "next";
import Link from "next/link";
import { Legend } from "@/components/Legend";
import { PageHeader } from "@/components/PageHeader";
import { EvidenceSquare, StatusChip } from "@/components/chips";
import { evaluateGate } from "@/lib/gate";
import { ds, currentAssessment, evidenceForCapability, proposalsFor } from "@/lib/data";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <div className="space-y-10">
      <PageHeader title="Capability by capability">
        Each row is assessed on its own criteria. There is no overall progress figure: levels can
        advance unevenly, and a result at one level does not imply the next.
      </PageHeader>

      <ul className="divide-y divide-line border-y border-line">
        {ds.capabilities.map((cap) => {
          const a = currentAssessment(cap.id);
          const evidence = evidenceForCapability(cap.id);
          const proposals = proposalsFor(cap.id);
          const blocked = proposals.some((p) => evaluateGate(p, ds).verdict === "blocked");
          return (
            <li key={cap.id}>
              <Link
                href={`/progress/${cap.id}`}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 gap-y-3 px-1 py-5 transition-colors hover:bg-white/[0.03] md:grid-cols-[2.75rem_minmax(0,1.5fr)_minmax(0,1fr)_5.5rem] md:items-center md:gap-x-5"
              >
                <span className="font-mono text-sm text-accent">{cap.level}</span>

                <div className="min-w-0">
                  <div className="font-serif text-lg leading-snug">{cap.name}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {a ? (
                      <>
                        <StatusChip status={a.status} />
                        <span className="text-xs text-muted">{a.confidence} confidence</span>
                      </>
                    ) : (
                      <span className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted">
                        Not assessed
                      </span>
                    )}
                    {proposals.length > 0 && (
                      <span className="rounded-full border border-warn/40 px-2 py-0.5 text-xs text-warn">
                        {blocked ? "Change proposed · blocked" : "Change proposed"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="col-start-2 md:col-start-auto">
                  {evidence.length ? (
                    <>
                      <div className="flex flex-wrap gap-1.5" aria-label={`${evidence.length} evidence records`}>
                        {evidence.map((e) => (
                          <EvidenceSquare key={e.id} e={e} />
                        ))}
                      </div>
                      <div className="mt-1.5 text-xs text-muted">
                        {evidence.length} evidence record{evidence.length === 1 ? "" : "s"}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted">No evidence linked</div>
                  )}
                </div>

                <div className="col-start-2 text-xs text-muted md:col-start-auto md:text-right">
                  {a ? `Version ${a.version}` : "—"}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <Legend evidence />
    </div>
  );
}
