import type { GateCheckState, GateResult } from "@/lib/gate";

const glyph: Record<GateCheckState, { mark: string; cls: string; label: string }> = {
  met: { mark: "✓", cls: "text-accent", label: "Met" },
  unmet: { mark: "✕", cls: "text-danger", label: "Not met" },
  "not-required": { mark: "–", cls: "text-muted", label: "Not required" },
  "awaiting-human": { mark: "◷", cls: "text-warn", label: "Awaiting a human reviewer" },
};

export function GateChecklist({ gate }: { gate: GateResult }) {
  return (
    <div>
      <div
        className={`rounded-md border px-3 py-2 text-sm ${
          gate.verdict === "blocked"
            ? "border-danger/40 text-danger"
            : "border-warn/40 text-warn"
        }`}
      >
        {gate.verdict === "blocked"
          ? "Blocked. This change cannot be accepted yet."
          : "Ready for human review. Nothing has been accepted."}
      </div>
      {gate.blockers.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-muted marker:text-danger">
          {gate.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <ol className="mt-4 divide-y divide-line border-y border-line">
        {gate.checks.map((c) => {
          const g = glyph[c.state];
          return (
            <li key={c.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 py-2.5">
              <span aria-hidden="true" className={`text-center ${g.cls}`}>
                {g.mark}
              </span>
              <div>
                <div className="text-sm">
                  {c.label} <span className="sr-only">: {g.label}</span>
                </div>
                <p className="mt-0.5 text-xs leading-5 text-muted">{c.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
