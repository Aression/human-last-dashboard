import Link from "next/link";
import { fill, getDictionary, localePath, type Locale } from "@/lib/i18n";
import type { Selectors } from "@/lib/selectors";
import type { SourceTier } from "@/lib/types";

const tierColor: Record<SourceTier, string> = {
  primary: "var(--text)",
  independent: "var(--accent)",
  lead: "var(--warning)",
};

/**
 * The sources behind the evidence, one dot per source and one row per tier.
 * A filled dot is not developer-affiliated; a ring is. The two answer different
 * questions (how close a source is to the claim versus who stands to gain from
 * it), so the chart keeps both instead of folding them into one score.
 */
export function SourceBase({
  locale,
  selectors,
}: {
  locale: Locale;
  selectors: Selectors;
}) {
  const dict = getDictionary(locale);
  const t = dict.overview;
  const base = selectors.sourceBase();

  const dot = (filled: boolean, color: string) => (
    <span
      aria-hidden="true"
      className="inline-block size-3.5 rounded-full border-2"
      style={{ borderColor: color, background: filled ? color : "transparent" }}
    />
  );

  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base">{t.sourcesTitle}</h3>
        <span className="text-xs text-muted">{fill(t.sourcesAside, { count: base.total })}</span>
      </div>

      <ul className="my-4 space-y-3">
        {base.tiers.map(({ tier, units }) => (
          <li key={tier} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
            <div>
              <span className="text-[13px]" style={{ color: tierColor[tier] }}>
                {dict.labels.sourceTier[tier]}
              </span>
              <span className="ml-2 font-serif text-lg tabular-nums">{units.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {units.length === 0 && <span className="text-xs text-muted">—</span>}
              {units.map((u) => {
                const label = `${u.title} — ${dict.labels.sourceTier[u.tier]}, ${
                  u.developerAffiliated
                    ? t.sourcesKeyDeveloper
                    : t.sourcesKeyIndependentOfDeveloper
                }`;
                return (
                  <span key={u.id} role="img" aria-label={label} title={label} className="inline-flex">
                    {dot(!u.developerAffiliated, tierColor[tier])}
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-2 border-t border-line pt-3">
        <p className="text-[13px] leading-5 text-muted">
          {fill(t.sourcesSummary, {
            independent: base.independentTier,
            total: base.total,
            developer: base.developerAffiliated,
          })}
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            {dot(true, "var(--muted)")} {t.sourcesKeyIndependentOfDeveloper}
          </span>
          <span className="flex items-center gap-1.5">
            {dot(false, "var(--muted)")} {t.sourcesKeyDeveloper}
          </span>
          <Link
            href={localePath(locale, "/evidence?tab=sources")}
            className="ml-auto text-ink underline underline-offset-4"
          >
            {t.sourcesLink}
          </Link>
        </div>
      </div>
    </div>
  );
}
