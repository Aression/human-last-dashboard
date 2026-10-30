/**
 * Report rendering for a quality run.
 *
 * The markdown is written for a human reviewer and for an agent reading the run
 * log. It restates the same rule the engine obeys (AGENTS.md rules 3 and 10): a
 * quality finding is a bookkeeping signal, not a verification of any claim. The
 * closing section says so explicitly, so a report pasted elsewhere cannot be read
 * as evidence that the dashboard's claims are true.
 */
import type { QualityFinding, QualityOutcome, Severity } from "./contracts";

const SEVERITY_ORDER: Severity[] = ["error", "warn", "info"];
const SEVERITY_LABEL: Record<Severity, string> = {
  error: "Errors",
  warn: "Warnings",
  info: "Information",
};
const DEFAULT_MAX_FINDINGS = 200;

export interface RenderOptions {
  title?: string;
  /** Findings printed before the report truncates; the JSON outcome keeps them all. */
  maxFindings?: number;
}

/** One-line summary for logs and the run index. Never contains a newline. */
export function summarize(outcome: QualityOutcome): string {
  const failed = outcome.checks.filter((check) => !check.ok);
  const inspected = outcome.checks.reduce((total, check) => total + check.inspected, 0);
  const skipped = outcome.checks.filter((check) => check.ok && check.inspected === 0);
  const parts = [
    `quality run ${outcome.run_id}: ${outcome.counts.total} finding(s)`,
    `${outcome.counts.error} error / ${outcome.counts.warn} warn / ${outcome.counts.info} info`,
    `${outcome.checks.length - failed.length}/${outcome.checks.length} rule check(s) ok`,
    `${inspected} subject(s) inspected`,
  ];
  if (skipped.length > 0) {
    parts.push(`skipped (nothing to inspect): ${skipped.map((check) => check.rule).join(", ")}`);
  }
  if (failed.length > 0) {
    parts.push(`failed: ${failed.map((check) => check.rule).join(", ")}`);
  }
  return parts.join("; ");
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function code(value: string): string {
  return `\`${value.replace(/`/g, "'")}\``;
}

function renderFinding(finding: QualityFinding): string[] {
  const lines: string[] = [];
  lines.push(`#### ${code(finding.id)} — ${finding.title}`);
  lines.push("");
  const subject = finding.subject.id
    ? `${finding.subject.kind} ${code(finding.subject.id)}`
    : finding.subject.kind;
  lines.push(
    `- **rule:** ${code(finding.rule)} · **severity:** ${finding.severity} · **subject:** ${subject} · **auto-fixable:** ${finding.auto_fixable ? "yes" : "no"}`,
  );
  lines.push(`- **detail:** ${finding.detail}`);
  if (finding.evidence.length > 0) {
    lines.push("- **evidence:**");
    for (const item of finding.evidence) {
      lines.push(`  - ${item.kind}: ${cell(item.value)}`);
    }
  } else {
    lines.push("- **evidence:** none recorded");
  }
  lines.push(`- **remediation:** ${finding.remediation}`);
  lines.push("");
  return lines;
}

/**
 * Render a quality outcome as Markdown: header, checks table, findings grouped by
 * severity, and what the report does not establish.
 */
export function renderQualityReport(
  outcome: QualityOutcome,
  opts: RenderOptions = {},
): string {
  const title = opts.title ?? "Evidence quality report";
  const maxFindings = Math.max(1, Math.floor(opts.maxFindings ?? DEFAULT_MAX_FINDINGS));
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- **Run id:** ${code(outcome.run_id)}`);
  lines.push(`- **Started:** ${outcome.started_at}`);
  lines.push(`- **Finished:** ${outcome.finished_at}`);
  lines.push(
    `- **Findings:** ${outcome.counts.total} (${outcome.counts.error} error, ${outcome.counts.warn} warn, ${outcome.counts.info} info)`,
  );
  lines.push(`- **Rule checks:** ${outcome.checks.length}`);
  lines.push("");

  lines.push("## Checks");
  lines.push("");
  lines.push("| Rule | OK | Findings | Inspected | Duration (ms) | Error |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const check of outcome.checks) {
    // `inspected === 0` means the rule had nothing to look at. Saying "yes" there
    // would read as "these records were checked and are fine", which is false.
    const status = !check.ok ? "**no**" : check.inspected === 0 ? "skipped" : "yes";
    lines.push(
      `| ${cell(check.rule)} | ${status} | ${check.findings} | ${check.inspected} | ${check.duration_ms} | ${
        check.error ? cell(check.error) : ""
      } |`,
    );
  }
  lines.push("");

  const shown = outcome.findings.slice(0, maxFindings);
  const skipped = outcome.checks.filter((check) => check.ok && check.inspected === 0);
  lines.push("## Findings");
  lines.push("");
  if (outcome.findings.length === 0) {
    if (skipped.length === 0) {
      lines.push(
        "No findings. Every selected rule reported a pass for the records it inspected.",
      );
    } else {
      lines.push(
        `No findings, but not every rule had something to inspect: ${skipped.length} of ${outcome.checks.length} check(s) were **skipped** because they had no subject (see the Inspected column). A skipped check is not a pass — it means this run says nothing about those records.`,
      );
      lines.push("");
      lines.push(`Skipped: ${skipped.map((check) => code(check.rule)).join(", ")}.`);
    }
    lines.push("");
  } else {
    for (const severity of SEVERITY_ORDER) {
      const group = shown.filter((finding) => finding.severity === severity);
      if (group.length === 0) continue;
      lines.push(`### ${SEVERITY_LABEL[severity]} (${group.length})`);
      lines.push("");
      for (const finding of group) lines.push(...renderFinding(finding));
    }
    if (outcome.findings.length > shown.length) {
      lines.push(
        `_Showing the first ${shown.length} of ${outcome.findings.length} findings. The JSON outcome (${code(
          `<root>/.evidence-mcp/quality/${outcome.run_id}.json`,
        )}) lists all of them._`,
      );
      lines.push("");
    }
  }

  lines.push("## What this report does not establish");
  lines.push("");
  lines.push(
    "This report audits records — the dashboard dataset and the discovery store — against maintenance rules. It does not verify that any claim, source, assessment, or forecast is true or accurate: a passing check means the records are internally consistent and recently maintained, and a finding is a bookkeeping problem, not a judgement about the claim behind it.",
  );
  lines.push("");
  lines.push(
    "It does not read every source. A `source-integrity` pass confirms only that a URL answered, and matched its recorded hash when one was recorded, at the moment of the run; page content can change afterwards, and a link that resolves is not an endorsement of what it says. Where a record is demo data it is fictional by construction, and findings about it exist to exercise these rules.",
  );
  lines.push("");
  lines.push(
    "A check marked `skipped` inspected nothing — usually because the records it looks at were absent (no candidate leads, no recorded source URLs). It is not a pass and it is not evidence that those records are sound; the Inspected column and the summary line carry the count of subjects each rule actually evaluated.",
  );
  lines.push("");
  lines.push(
    "Nothing here changes a record: findings carry remediation instructions only, and no finding promotes a discovered lead into a reviewed source or moves an assessment stage. Confirm any maintenance action against the underlying record before applying it.",
  );
  lines.push("");

  return lines.join("\n");
}
