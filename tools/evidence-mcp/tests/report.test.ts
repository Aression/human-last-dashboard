/**
 * Report rendering tests.
 *
 * `renderQualityReport` and `summarize` are pure: they take a QualityOutcome and
 * produce text. No store, no network, no filesystem. The assertions below pin the
 * two properties the rest of the tool relies on — a stable table shape for the CLI,
 * and the closing section that stops the report being read as verification.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { renderQualityReport, summarize } from "../src/report";

import type {
  QualityCheck,
  QualityFinding,
  QualityOutcome,
  Severity,
} from "../src/contracts";

function finding(over: Partial<QualityFinding> & { id: string }): QualityFinding {
  return {
    rule: "dataset-valid",
    severity: "warn",
    title: "Synthetic finding",
    detail: "Synthetic detail.",
    subject: { kind: "source", id: "s-01" },
    evidence: [{ kind: "value", value: "synthetic=evidence" }],
    remediation: "Synthetic remediation.",
    auto_fixable: false,
    ...over,
  };
}

function check(over: Partial<QualityCheck> & { rule: string }): QualityCheck {
  return { ok: true, findings: 0, inspected: 1, duration_ms: 1, ...over };
}

function outcome(over: Partial<QualityOutcome> = {}): QualityOutcome {
  const findings = over.findings ?? [];
  const counts = { error: 0, warn: 0, info: 0, total: findings.length } as Record<
    Severity,
    number
  > & { total: number };
  for (const item of findings) counts[item.severity] += 1;
  return {
    run_id: "run-2026-01-01T00-00-00-000Z-abcd",
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:00:01.000Z",
    checks: [check({ rule: "dataset-valid", findings: findings.length })],
    counts,
    ...over,
    findings,
  };
}

test("renders the header, the checks table, and one section per severity", () => {
  const report = renderQualityReport(
    outcome({
      findings: [
        finding({ id: "qf-a", severity: "error", rule: "dataset-selectors" }),
        finding({ id: "qf-b", severity: "warn" }),
        finding({ id: "qf-c", severity: "info", rule: "candidate-untriaged" }),
      ],
      checks: [
        check({ rule: "dataset-selectors", findings: 1 }),
        check({ rule: "source-integrity", ok: false, error: "boom | pipe", findings: 0 }),
      ],
    }),
  );

  assert.ok(report.startsWith("# Evidence quality report\n"));
  assert.match(report, /\*\*Run id:\*\* `run-2026-01-01T00-00-00-000Z-abcd`/);
  assert.match(report, /\*\*Findings:\*\* 3 \(1 error, 1 warn, 1 info\)/);
  assert.match(report, /\*\*Rule checks:\*\* 2/);

  assert.match(report, /\| Rule \| OK \| Findings \| Inspected \| Duration \(ms\) \| Error \|/);
  assert.match(report, /\| --- \| --- \| --- \| --- \| --- \| --- \|/);
  assert.match(report, /\| dataset-selectors \| yes \| 1 \| 1 \| 1 \| {2}\|/);
  // A failed check must be visibly failed, and a pipe in its error escaped.
  assert.match(report, /\| source-integrity \| \*\*no\*\* \| 0 \| 1 \| 1 \| boom \\\| pipe \|/);

  // Severity groups appear in a fixed order, and only for present severities.
  const errorAt = report.indexOf("### Errors (1)");
  const warnAt = report.indexOf("### Warnings (1)");
  const infoAt = report.indexOf("### Information (1)");
  assert.ok(errorAt > 0 && warnAt > errorAt && infoAt > warnAt, "severity order wrong");

  for (const id of ["qf-a", "qf-b", "qf-c"]) {
    assert.match(report, new RegExp(`#### \`${id}\``));
  }
  assert.match(report, /\*\*subject:\*\* source `s-01`/);
  assert.match(report, /\*\*auto-fixable:\*\* no/);
  assert.match(report, /- \*\*remediation:\*\* Synthetic remediation\./);
});

test("an empty outcome says so and still carries the limitation section", () => {
  const report = renderQualityReport(outcome());
  assert.match(report, /## Findings\n\nNo findings\. Every selected rule reported a pass/);
  assert.match(report, /## What this report does not establish/);
  assert.match(report, /does not verify that any claim, source, assessment, or forecast is true/);
});

test("the report can never be read as verification of a claim", () => {
  const report = renderQualityReport(outcome({ findings: [finding({ id: "qf-a" })] }));
  assert.match(report, /## What this report does not establish/);
  // The three disclaimers the tool advertises: no truth verification, no full read
  // of sources, no record mutation.
  assert.match(report, /does not verify that any claim/);
  assert.match(report, /does not read every source/);
  assert.match(report, /Nothing here changes a record/);
  assert.match(report, /demo data it is fictional by construction/);
});

test("maxFindings truncates the listing but names the true total and the JSON file", () => {
  const findings = [
    finding({ id: "qf-1", severity: "error" }),
    finding({ id: "qf-2", severity: "error" }),
    finding({ id: "qf-3", severity: "warn" }),
  ];
  const full = renderQualityReport(outcome({ findings }));
  const cut = renderQualityReport(outcome({ findings }), { maxFindings: 1 });

  assert.match(full, /\*\*Findings:\*\* 3 \(2 error, 1 warn, 0 info\)/);
  assert.doesNotMatch(full, /Showing the first/);

  assert.match(cut, /_Showing the first 1 of 3 findings\./);
  assert.match(cut, new RegExp(`quality/run-2026-01-01T00-00-00-000Z-abcd\\.json`));
  // The counts line still reports everything; only the body is truncated.
  assert.match(cut, /\*\*Findings:\*\* 3 \(2 error, 1 warn, 0 info\)/);
  assert.match(cut, /\*\*Rule checks:\*\*/);
});

test("title option renames the heading and code fences are neutralised", () => {
  const report = renderQualityReport(
    outcome({ findings: [finding({ id: "qf-`x`", evidence: [] })] }),
    { title: "Nightly quality report" },
  );
  assert.ok(report.startsWith("# Nightly quality report\n"));
  assert.ok(!report.includes("qf-`x`"), "backtick in an id must not break the inline code");
  assert.match(report, /- \*\*evidence:\*\* none recorded/);
});

test("summarize is one line naming counts, checks, and failed rules", () => {
  const clean = summarize(
    outcome({ checks: [check({ rule: "dataset-valid" }), check({ rule: "dataset-selectors" })] }),
  );
  assert.ok(!clean.includes("\n"));
  assert.match(clean, /^quality run run-2026-01-01T00-00-00-000Z-abcd: 0 finding\(s\)/);
  assert.match(clean, /0 error \/ 0 warn \/ 0 info/);
  assert.match(clean, /2\/2 rule check\(s\) ok/);
  assert.match(clean, /2 subject\(s\) inspected/);
  assert.doesNotMatch(clean, /failed:/);

  const failed = summarize(
    outcome({
      findings: [finding({ id: "qf-a", severity: "error" })],
      checks: [
        check({ rule: "dataset-valid", findings: 1 }),
        check({ rule: "source-integrity", ok: false, error: "network down" }),
      ],
    }),
  );
  assert.ok(!failed.includes("\n"));
  assert.match(failed, /1 error \/ 0 warn \/ 0 info/);
  assert.match(failed, /1\/2 rule check\(s\) ok/);
  assert.match(failed, /failed: source-integrity$/);
});

test("a check that inspected nothing renders as skipped, never as a pass", () => {
  const report = renderQualityReport(
    outcome({
      checks: [
        check({ rule: "evidence-unreviewed", inspected: 6 }),
        check({ rule: "source-integrity", inspected: 0 }),
        check({ rule: "candidate-stale", ok: false, inspected: 0, error: "store unreadable" }),
      ],
    }),
  );

  assert.match(report, /\| evidence-unreviewed \| yes \| 0 \| 6 \|/);
  assert.match(report, /\| source-integrity \| skipped \| 0 \| 0 \| 1 \| {2}\|/);
  // A failed check is never downgraded to "skipped", even with inspected 0.
  assert.match(report, /\| candidate-stale \| \*\*no\*\* \| 0 \| 0 \| 1 \| store unreadable \|/);
  // The empty-findings line must not claim a pass for a rule that saw nothing.
  assert.doesNotMatch(report, /Every selected rule reported a pass/);
  assert.match(report, /not every rule had something to inspect: 1 of 3 check\(s\) were \*\*skipped\*\*/);
  assert.match(report, /A skipped check is not a pass/);
  assert.match(report, /Skipped: `source-integrity`\./);
});

test("summarize names skipped rules and the inspected total", () => {
  const line = summarize(
    outcome({
      checks: [
        check({ rule: "evidence-unreviewed", inspected: 6 }),
        check({ rule: "source-integrity", inspected: 0 }),
        check({ rule: "candidate-untriaged", inspected: 0 }),
      ],
    }),
  );
  assert.ok(!line.includes("\n"));
  assert.match(line, /6 subject\(s\) inspected/);
  assert.match(line, /skipped \(nothing to inspect\): source-integrity, candidate-untriaged/);
});
