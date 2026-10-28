import { Statement } from "./Statement";
import { EvidenceSquare } from "./chips";

/** Explains the visual grammar once, wherever a page leans on it. */
export function Legend({ evidence = false }: { evidence?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm">How to read statements</h2>
      <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
        <Statement kind="fact">Observed fact: something a source reports as having happened.</Statement>
        <Statement kind="interp">Interpretation: an author’s reading of the facts.</Statement>
        <Statement kind="spec">Speculation or hypothesis: not established.</Statement>
        <Statement kind="forecast">Forecast: a dated, checkable prediction.</Statement>
        <Statement kind="fact" model className="sm:col-span-2">
          Hatched background: written by a model. Treat it as a proposal until a reviewer accepts it.
        </Statement>
      </div>
      {evidence && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <EvidenceSquare e={{ id: "key", polarity: "supports", review_status: "accepted" }} /> Accepted
          </span>
          <span className="flex items-center gap-1.5">
            <EvidenceSquare e={{ id: "key", polarity: "supports", review_status: "unreviewed" }} /> Not yet accepted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px]" style={{ background: "var(--accent)" }} /> Supports
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px]" style={{ background: "var(--danger)" }} /> Contradicts
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px]" style={{ background: "var(--warning)" }} /> Qualifies
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px]" style={{ background: "var(--muted)" }} /> Context
          </span>
        </div>
      )}
    </div>
  );
}
