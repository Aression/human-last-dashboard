import { EvidenceSquare } from "@/components/chips";
import { getDictionary, type Locale } from "@/lib/i18n";

/**
 * The key to the evidence squares, in one place. A square's fill says whether a
 * reviewer accepted the record; its colour says which way it points. Both are
 * also spelled out in the square's accessible label.
 */
export function EvidenceKey({
  locale = "en",
  direction = true,
}: {
  locale?: Locale;
  /** Include the four direction colours. Charts that already label them skip it. */
  direction?: boolean;
}) {
  const t = getDictionary(locale).legend.evidence;
  const swatch = (color: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className="inline-block size-3 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <EvidenceSquare e={{ id: "key", polarity: "supports", review_status: "accepted" }} locale={locale} />
        {t.accepted}
      </span>
      <span className="flex items-center gap-1.5">
        <EvidenceSquare e={{ id: "key", polarity: "supports", review_status: "unreviewed" }} locale={locale} />
        {t.notAccepted}
      </span>
      {direction && (
        <>
          {swatch("var(--accent)", t.supports)}
          {swatch("var(--danger)", t.contradicts)}
          {swatch("var(--warning)", t.qualifies)}
          {swatch("var(--muted)", t.context)}
        </>
      )}
    </div>
  );
}
