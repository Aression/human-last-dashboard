import { EvidenceSquare } from "@/components/chips";
import type { Locale } from "@/lib/i18n";
import type { EvidenceUnit } from "@/lib/selectors";

/**
 * Evidence drawn as one square per record, in the order the selector gives
 * (grouped by direction). Squares are counted, never scaled: there is no axis
 * and nothing here turns a count into a percentage.
 */
export function UnitStrip({
  items,
  locale,
  size = "md",
  label,
}: {
  items: EvidenceUnit[];
  locale: Locale;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {items.map((e) => (
        <EvidenceSquare key={e.id} e={e} locale={locale} size={size} />
      ))}
    </div>
  );
}
