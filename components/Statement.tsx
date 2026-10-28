import type { ReactNode } from "react";
import type { ClaimType } from "@/lib/types";

export type StatementKind = "fact" | "interp" | "spec" | "forecast";

export const kindFromClaimType: Record<ClaimType, StatementKind> = {
  "observed-fact": "fact",
  "author-interpretation": "interp",
  speculation: "spec",
  forecast: "forecast",
};

export const kindName: Record<StatementKind, string> = {
  fact: "Observed fact",
  interp: "Interpretation",
  spec: "Speculation or hypothesis",
  forecast: "Forecast",
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
  children,
  className = "",
}: {
  kind: StatementKind;
  model?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ep ${kindClass[kind]} ${model ? "ep-model" : ""} py-0.5 ${className}`}>
      <span className="sr-only">
        {kindName[kind]}
        {model ? ", model-generated" : ""}:{" "}
      </span>
      {children}
    </div>
  );
}
