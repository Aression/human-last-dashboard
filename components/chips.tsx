import type {
  AssessmentStatus,
  Evidence,
  ForecastStatus,
  Polarity,
  ReviewStatus,
  Source,
  SourceTier,
} from "@/lib/types";
import { getDictionary, type Locale } from "@/lib/i18n";

/**
 * Chips render a controlled vocabulary, so their text comes from the dictionary
 * rather than from a parallel label map: one word, one place. `locale` defaults
 * to English so a call site that has not been localized yet keeps rendering.
 */

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs leading-5 whitespace-nowrap";

export function DemoTag({ locale = "en" }: { locale?: Locale }) {
  const dict = getDictionary(locale);
  return (
    <span className={`${chip} border-warn/40 text-warn`} title={dict.chips.demoTitle}>
      {dict.chips.demo}
    </span>
  );
}

export function ModelTag({ model, locale = "en" }: { model?: string; locale?: Locale }) {
  const dict = getDictionary(locale);
  return (
    <span
      className={`${chip} border-hyp/40 text-hyp`}
      title={
        model ? dict.chips.modelGeneratedByTitle.replace("{model}", model) : dict.chips.modelGenerated
      }
    >
      {dict.chips.modelGenerated}
    </span>
  );
}

const statusStyle: Record<AssessmentStatus, { glyph: string; cls: string }> = {
  unverified: { glyph: "○", cls: "border-line text-muted" },
  partial: { glyph: "◐", cls: "border-warn/50 text-warn" },
  "demonstrated-under-conditions": { glyph: "●", cls: "border-accent/50 text-accent" },
  "independently-reproduced": { glyph: "◉", cls: "border-accent bg-accent/10 text-accent" },
  contradicted: { glyph: "✕", cls: "border-danger/50 text-danger" },
  "insufficient-evidence": { glyph: "◌", cls: "border-dashed border-line text-muted" },
};

/**
 * The colour a status is drawn in where a chip would be too heavy (the edge of a
 * board tile). Colour is never the only cue: the chip beside it carries a glyph
 * and a word.
 */
export const statusColor: Record<AssessmentStatus, string> = {
  unverified: "var(--muted)",
  partial: "var(--warning)",
  "demonstrated-under-conditions": "var(--accent)",
  "independently-reproduced": "var(--accent)",
  contradicted: "var(--danger)",
  "insufficient-evidence": "var(--border)",
};

export function StatusChip({
  status,
  locale = "en",
}: {
  status: AssessmentStatus;
  locale?: Locale;
}) {
  const s = statusStyle[status];
  return (
    <span className={`${chip} ${s.cls}`}>
      <span aria-hidden="true">{s.glyph}</span>
      {getDictionary(locale).labels.assessmentStatus[status]}
    </span>
  );
}

export const polarityColor: Record<Polarity, string> = {
  supports: "var(--accent)",
  contradicts: "var(--danger)",
  qualifies: "var(--warning)",
  contextualizes: "var(--muted)",
};

const polarityGlyph: Record<Polarity, string> = {
  supports: "+",
  contradicts: "−",
  qualifies: "~",
  contextualizes: "·",
};

export function PolarityChip({
  polarity,
  locale = "en",
}: {
  polarity: Polarity;
  locale?: Locale;
}) {
  return (
    <span className={chip} style={{ borderColor: polarityColor[polarity], color: polarityColor[polarity] }}>
      <span aria-hidden="true" className="font-mono">
        {polarityGlyph[polarity]}
      </span>
      {getDictionary(locale).labels.polarity[polarity]}
    </span>
  );
}

const reviewCls: Record<ReviewStatus, string> = {
  accepted: "border-accent/40 text-accent",
  unreviewed: "border-dashed border-line text-muted",
  "needs-follow-up": "border-warn/40 text-warn",
  rejected: "border-danger/40 text-danger",
};

export function ReviewChip({
  status,
  locale = "en",
}: {
  status: ReviewStatus;
  locale?: Locale;
}) {
  return (
    <span className={`${chip} ${reviewCls[status]}`}>
      {getDictionary(locale).labels.reviewStatus[status]}
    </span>
  );
}

const tierCls: Record<SourceTier, string> = {
  primary: "border-line text-ink",
  independent: "border-accent/40 text-accent",
  lead: "border-dashed border-warn/40 text-warn",
};

export function TierChip({
  source,
  locale = "en",
}: {
  source: Source;
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <span className={`${chip} ${tierCls[source.source_tier]}`}>
        {dict.labels.sourceTier[source.source_tier]}
      </span>
      {source.developer_affiliated && (
        <span className={`${chip} border-line text-muted`} title={dict.chips.developerAffiliatedTitle}>
          {dict.chips.developerAffiliated}
        </span>
      )}
    </span>
  );
}

const forecastCls: Record<ForecastStatus, string> = {
  open: "border-fc/50 text-fc",
  "resolved-true": "border-accent/50 text-accent",
  "resolved-false": "border-danger/50 text-danger",
  ambiguous: "border-warn/50 text-warn",
  expired: "border-line text-muted",
};

export function ForecastChip({
  status,
  locale = "en",
}: {
  status: ForecastStatus;
  locale?: Locale;
}) {
  return (
    <span className={`${chip} ${forecastCls[status]}`}>
      {getDictionary(locale).labels.forecastStatus[status]}
    </span>
  );
}

/**
 * One evidence record as a small square: filled when accepted, hollow otherwise.
 * `md` is the size charts use; `sm` is the original size for inline use.
 */
export function EvidenceSquare({
  e,
  locale = "en",
  size = "sm",
}: {
  e: Pick<Evidence, "id" | "polarity" | "review_status">;
  locale?: Locale;
  size?: "sm" | "md";
}) {
  const dict = getDictionary(locale);
  const color = polarityColor[e.polarity];
  const accepted = e.review_status === "accepted";
  const label = `${e.id}: ${dict.labels.polarity[e.polarity]}, ${dict.labels.reviewStatus[e.review_status]}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-block rounded-[3px] border-2 ${size === "md" ? "size-4" : "size-3"}`}
      style={{
        borderColor: color,
        background: accepted ? color : "transparent",
        borderStyle: accepted ? "solid" : "dashed",
      }}
    />
  );
}
