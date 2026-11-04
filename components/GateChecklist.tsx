import type { GateCheckState, GateResult } from "@/lib/gate";
import type { AssessmentStatus } from "@/lib/types";
import { fill, getDictionary, type Dictionary, type Locale } from "@/lib/i18n";

/**
 * `lib/gate.ts` composes the checklist in English because it is also used
 * outside React (tests, the data build). The localised rendering therefore maps
 * that wording back onto the dictionary: labels are matched by their English
 * reference string, canned detail sentences and blockers by their template, and
 * anything a human recorded is shown exactly as written.
 */
type CheckKey = keyof Dictionary["gate"]["check"];

const enGate = getDictionary("en").gate;

function checkKey(label: string): CheckKey | undefined {
  return (Object.keys(enGate.check) as CheckKey[]).find((k) => enGate.check[k] === label);
}

function checkLabel(label: string, dict: Dictionary): string {
  const key = checkKey(label);
  return key ? dict.gate.check[key] : label;
}

/** A count-bearing gate sentence, rebuilt from the dictionary template. */
function counted(detail: string, re: RegExp, template: string): string | null {
  const m = re.exec(detail);
  return m?.[1] ? fill(template, { count: m[1] }) : null;
}

function checkDetail(detail: string, dict: Dictionary): string {
  const en = enGate.detail;
  const d = dict.gate.detail;

  const fixed: [string, string][] = [
    [en.noCriterion, d.noCriterion],
    [en.noDirectContradiction, d.noDirectContradiction],
    [en.noDirectEvidence, d.noDirectEvidence],
    [en.noConditionsBaseline, d.noConditionsBaseline],
    [en.noHumanIntervention, d.noHumanIntervention],
    [en.noIndependentSupport, d.noIndependentSupport],
    [en.replicationNotRequired, d.replicationNotRequired],
    [en.noCounterSearch, d.noCounterSearch],
    [en.noGeneralization, d.noGeneralization],
    [en.reviewerOnlyHuman, d.reviewerOnlyHuman],
  ];
  for (const [from, to] of fixed) if (detail === from) return to;

  const moved = /^A move to “(.+)” does not assert a capability\.$/.exec(detail);
  if (moved?.[1]) {
    const status = dict.labels.assessmentStatus[moved[1] as AssessmentStatus] ?? moved[1];
    return fill(d.directNotRequired, { status });
  }

  const linked = /^(\d+) supporting record\(s\) linked, but none is both accepted and from a primary or independent source \((.+)\)\.$/.exec(
    detail,
  );
  if (linked?.[1] && linked[2])
    return fill(d.linkedButNotAccepted, { count: linked[1], list: linked[2] });

  const rules: [RegExp, string][] = [
    [/^(\d+) accepted (?:supporting )?record\(s\) from primary or independent sources\.$/, d.acceptedDirect],
    [
      /^(\d+) accepted record\(s\) from a source that is independent of the developer\.$/,
      d.acceptedIndependent,
    ],
    [/^(\d+) counterevidence record\(s\) linked\.$/, d.counterLinked],
  ];
  for (const [re, template] of rules) {
    const text = counted(detail, re, template);
    if (text) return text;
  }

  // A value a reviewer recorded is free text, and stays as written.
  return detail;
}

function blockerText(blocker: string, dict: Dictionary): string {
  const en = enGate.blocker;
  const b = dict.gate.blocker;
  if (blocker === en.leadsOnly) return b.leadsOnly;
  if (blocker === en.notAcceptedPrimary) return b.notAcceptedPrimary;
  if (blocker === en.developerOnly) return b.developerOnly;
  const unmet = /^(.*): not met\.$/.exec(blocker);
  if (unmet?.[1]) return fill(b.unmetCheck, { check: checkLabel(unmet[1], dict) });
  return blocker;
}

export function GateChecklist({ gate, locale = "en" }: { gate: GateResult; locale?: Locale }) {
  const dict = getDictionary(locale);

  const glyph: Record<GateCheckState, { mark: string; cls: string; label: string }> = {
    met: { mark: "✓", cls: "text-accent", label: dict.gate.state.met },
    unmet: { mark: "✕", cls: "text-danger", label: dict.gate.state.unmet },
    "not-required": { mark: "–", cls: "text-muted", label: dict.gate.state["not-required"] },
    "awaiting-human": {
      mark: "◷",
      cls: "text-warn",
      label: dict.gate.state["awaiting-human"],
    },
  };

  return (
    <div>
      <div
        className={`rounded-md border px-3 py-2 text-sm ${
          gate.verdict === "blocked"
            ? "border-danger/40 text-danger"
            : "border-warn/40 text-warn"
        }`}
      >
        {gate.verdict === "blocked" ? dict.gate.verdictBlocked : dict.gate.verdictReady}
      </div>
      {gate.blockers.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-muted marker:text-danger">
          {gate.blockers.map((b) => (
            <li key={b}>{blockerText(b, dict)}</li>
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
                  {checkLabel(c.label, dict)}{" "}
                  <span className="sr-only">: {g.label}</span>
                </div>
                <p className="mt-0.5 text-xs leading-5 text-muted">
                  {checkDetail(c.detail, dict)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
