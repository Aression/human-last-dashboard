import Link from "next/link";
import { StatusChip, statusColor } from "@/components/chips";
import { fill, getDictionary, localePath, type Locale } from "@/lib/i18n";
import type { Selectors } from "@/lib/selectors";
import { UnitStrip } from "./UnitStrip";

/**
 * One tile per capability level: its current assessment and the evidence linked
 * to it. The grid is a reading order, not a ladder: a tile's colour and glyph
 * say how well one level is supported and never imply progress toward the next.
 */
export function CapabilityBoard({
  locale,
  selectors,
}: {
  locale: Locale;
  selectors: Selectors;
}) {
  const dict = getDictionary(locale);
  const rows = selectors.evidenceByCapability();

  return (
    <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {rows.map(({ capability, items }) => {
        const assessment = selectors.currentAssessment(capability.id);
        const count = fill(
          items.length === 1 ? dict.progress.evidenceRecordsOne : dict.progress.evidenceRecordsOther,
          { count: items.length },
        );
        return (
          <li key={capability.id}>
            <Link
              href={localePath(locale, `/progress/${capability.id}`)}
              className="flex h-full flex-col gap-3 rounded-lg border border-t-2 border-line bg-surface p-3 transition-colors sm:p-4 hover:border-muted"
              style={{
                borderTopColor: assessment ? statusColor[assessment.status] : "var(--border)",
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm text-accent">{capability.level}</span>
                {assessment && (
                  <span className="hidden text-xs text-muted sm:inline">
                    {fill(dict.progress.confidence, {
                      level: dict.labels.confidence[assessment.confidence],
                    })}
                  </span>
                )}
              </div>

              <div className="font-serif text-[15px] leading-snug">{capability.name}</div>

              <div className="[&>span]:max-w-full [&>span]:whitespace-normal">
                {assessment ? (
                  <StatusChip status={assessment.status} locale={locale} />
                ) : (
                  <span className="inline-flex rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted">
                    {dict.progress.notAssessed}
                  </span>
                )}
              </div>

              <div className="mt-auto border-t border-line/60 pt-3">
                {items.length > 0 ? (
                  <>
                    <UnitStrip items={items} locale={locale} label={count} />
                    <div className="mt-1.5 text-xs text-muted">{count}</div>
                  </>
                ) : (
                  <div className="text-xs text-muted">{dict.overview.boardNoEvidence}</div>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
