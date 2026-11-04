import { getDictionary, type Locale } from "@/lib/i18n";
import { Statement } from "./Statement";
import { EvidenceSquare } from "./chips";

/** Explains the visual grammar once, wherever a page leans on it. */
export function Legend({ evidence = false, locale = "en" }: { evidence?: boolean; locale?: Locale }) {
  const dict = getDictionary(locale);
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm">{dict.legend.title}</h2>
      <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
        <Statement kind="fact" locale={locale}>
          {dict.legend.fact}
        </Statement>
        <Statement kind="interp" locale={locale}>
          {dict.legend.interp}
        </Statement>
        <Statement kind="spec" locale={locale}>
          {dict.legend.spec}
        </Statement>
        <Statement kind="forecast" locale={locale}>
          {dict.legend.forecast}
        </Statement>
        <Statement kind="fact" model locale={locale} className="sm:col-span-2">
          {dict.legend.model}
        </Statement>
      </div>
      {evidence && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <EvidenceSquare
              e={{ id: "key", polarity: "supports", review_status: "accepted" }}
              locale={locale}
            />{" "}
            {dict.legend.evidence.accepted}
          </span>
          <span className="flex items-center gap-1.5">
            <EvidenceSquare
              e={{ id: "key", polarity: "supports", review_status: "unreviewed" }}
              locale={locale}
            />{" "}
            {dict.legend.evidence.notAccepted}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px]" style={{ background: "var(--accent)" }} />{" "}
            {dict.legend.evidence.supports}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px]" style={{ background: "var(--danger)" }} />{" "}
            {dict.legend.evidence.contradicts}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px]" style={{ background: "var(--warning)" }} />{" "}
            {dict.legend.evidence.qualifies}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px]" style={{ background: "var(--muted)" }} />{" "}
            {dict.legend.evidence.context}
          </span>
        </div>
      )}
    </div>
  );
}
