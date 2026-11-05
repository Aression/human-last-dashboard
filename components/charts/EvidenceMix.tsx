import { EvidenceSquare, polarityColor } from "@/components/chips";
import { fill, getDictionary, type Locale } from "@/lib/i18n";
import { POLARITY_ORDER, REVIEW_ORDER, type Selectors } from "@/lib/selectors";
import { EvidenceKey } from "./EvidenceKey";

/** Pitch of one square plus its gap, in px: `size-4` (16) + `gap-1` (4). */
const PITCH = 20;

/**
 * Every evidence record once, as a histogram of unit squares: one column per
 * direction, one square per record, all columns on the same baseline. Below it,
 * how many records a reviewer has accepted, because that decides whether any of
 * these counts is a finding.
 */
export function EvidenceMix({
  locale,
  selectors,
}: {
  locale: Locale;
  selectors: Selectors;
}) {
  const dict = getDictionary(locale);
  const t = dict.overview;
  const mix = selectors.evidenceMix();
  const height = Math.max(mix.largestGroup, 1) * PITCH - 4;

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base">{t.mixTitle}</h3>
        <span className="text-xs text-muted">{fill(t.mixAside, { count: mix.total })}</span>
      </div>

      {mix.total === 0 ? (
        <p className="mt-4 text-sm text-muted">{t.mixEmpty}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
            {POLARITY_ORDER.map((polarity) => {
              const units = mix.units.filter((u) => u.polarity === polarity);
              const label = dict.labels.polarity[polarity];
              return (
                <div key={polarity}>
                  <div
                    role="group"
                    aria-label={`${label}: ${units.length}`}
                    className="grid content-end justify-items-start gap-1"
                    style={{ height }}
                  >
                    {units.map((e) => (
                      <EvidenceSquare key={e.id} e={e} locale={locale} size="md" />
                    ))}
                  </div>
                  <div className="mt-2 border-t border-line pt-2">
                    <div className="font-serif text-2xl leading-none tabular-nums">
                      {units.length}
                    </div>
                    <div className="mt-1 break-words text-[11px] sm:text-xs" style={{ color: polarityColor[polarity] }}>
                      {label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-2 border-t border-line pt-3">
            <p className="text-xs text-muted">
              <span>{t.mixReviewState}: </span>
              {REVIEW_ORDER.map((status, i) => (
                <span key={status}>
                  {i > 0 && " · "}
                  <span className="tabular-nums text-ink">{mix.review[status]}</span>{" "}
                  {dict.labels.reviewStatus[status].toLowerCase()}
                </span>
              ))}
            </p>
            {mix.review.accepted === 0 && (
              <p className="text-[13px] leading-5 text-warn">{t.mixNoneAccepted}</p>
            )}
            <EvidenceKey locale={locale} direction={false} />
          </div>
        </>
      )}
    </div>
  );
}
