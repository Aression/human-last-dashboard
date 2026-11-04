import type { ReactNode } from "react";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { ClaimType } from "@/lib/types";

export type StatementKind = "fact" | "interp" | "spec" | "forecast";

export const kindFromClaimType: Record<ClaimType, StatementKind> = {
  "observed-fact": "fact",
  "author-interpretation": "interp",
  speculation: "spec",
  forecast: "forecast",
};

const kindClass: Record<StatementKind, string> = {
  fact: "ep-fact",
  interp: "ep-interp",
  spec: "ep-spec",
  forecast: "ep-forecast",
};

/**
 * A statement whose border and typography declare its epistemic status.
 * `model` adds a hatch and a visually hidden marker for text produced by a model.
 */
export function Statement({
  kind,
  model = false,
  locale = "en",
  children,
  className = "",
}: {
  kind: StatementKind;
  model?: boolean;
  locale?: Locale;
  children: ReactNode;
  className?: string;
}) {
  const dict = getDictionary(locale);
  return (
    <div className={`ep ${kindClass[kind]} ${model ? "ep-model" : ""} py-0.5 ${className}`}>
      <span className="sr-only">
        {dict.statement[kind]}
        {model ? dict.statement.modelSuffix : ""}:{" "}
      </span>
      {children}
    </div>
  );
}
