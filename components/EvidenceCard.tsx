import Link from "next/link";
import type { Evidence, Source } from "@/lib/types";
import { getDictionary, localePath, type Locale } from "@/lib/i18n";
import { DemoTag, PolarityChip, ReviewChip, TierChip } from "./chips";
import { Statement } from "./Statement";

export function EvidenceCard({
  e,
  source,
  locale = "en",
}: {
  e: Evidence;
  source: Source;
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  return (
    <article id={e.id} className="scroll-mt-6 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={localePath(locale, `/evidence/${e.id}`)}
          className="font-mono text-xs text-accent underline-offset-4 hover:underline"
        >
          {e.id}
        </Link>
        <PolarityChip polarity={e.polarity} locale={locale} />
        <ReviewChip status={e.review_status} locale={locale} />
        <span className="text-xs text-muted">{dict.labels.evidenceType[e.evidence_type]}</span>
        {e.provenance === "demo" && <DemoTag locale={locale} />}
      </div>

      <Statement kind="fact" locale={locale} className="mt-3 text-[15px] leading-6">
        {e.observation}
      </Statement>

      <p className="mt-3 text-[13px] leading-5 text-muted">
        <span className="text-ink">{dict.record.limitations}</span> {e.limitations}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
        <Link
          href={localePath(locale, `/evidence/${source.id}`)}
          className="underline-offset-4 hover:text-ink hover:underline"
        >
          {source.title}
        </Link>
        <TierChip source={source} locale={locale} />
      </div>
    </article>
  );
}
