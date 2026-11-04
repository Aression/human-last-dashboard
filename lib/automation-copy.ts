/**
 * Wording shared by the tooling that writes `data/automation/snapshot.json` and
 * the page that renders it, kept in its own module so neither has to import the
 * other (and so the tooling does not pull the app's dataset into a build step).
 *
 * This module deliberately does not import `lib/i18n`: the tooling reads the
 * English constant, and the page picks a language with the small helpers below.
 */

/** Stored inside every snapshot; the page prints it verbatim (English). */
export const DISCOVERED_LEAD_NOTE =
  "A discovered lead is a pointer to a page that exists, with the retrieval facts that were actually observed. It is not evidence, it is not part of the dataset, and it is not shown on the Evidence Explorer.";

const DISCOVERED_LEAD_NOTE_ZH =
  "被发现的线索只是“某页面确实存在”的指针，附带实际观测到的抓取事实。它不是证据，不属于数据集，也不会出现在证据浏览器里。";

/** What a reader must not conclude from the automation page. */
export const AUTOMATION_LIMITS: string[] = [
  "Nothing on this page has been reviewed by a human or promoted into the dataset. A lead becomes evidence only through a separate, reviewed edit, and the tooling cannot make that edit.",
  "A retrieval hash proves which bytes were fetched, not that the page is correct, current, or relevant to the capability it was discovered for.",
  "A page fetched with an error status (for example HTTP 429) is stored as a lead with the error recorded; no summary was extracted from the error page.",
  "The page renders the last published snapshot, not live state. The tool runs every six hours and every day, but the numbers stop changing until someone runs the publish command and commits the result.",
  "A rule that inspected zero subjects is reported as skipped, not as passed. A clean audit does not mean the dataset is well sourced — it means the rules found nothing they could test.",
  "Discovery is limited to three adapters (arXiv, GitHub, RSS/Atom feeds). Absence of a lead is absence of coverage, not absence of work.",
];

const AUTOMATION_LIMITS_ZH: string[] = [
  "本页没有任何内容经过人工审阅，也没有被提升进数据集。线索只有通过另外一次、经过审阅的编辑才会变成证据，而工具本身做不了这次编辑。",
  "抓取哈希只能证明抓到了哪些字节，不能证明页面内容正确、及时，或与被发现时对应的能力有关。",
  "以错误状态（例如 HTTP 429）抓取的页面会作为线索保存并记录该错误；没有从错误页面里提取任何摘要。",
  "本页渲染的是上一次发布的快照，不是实时状态。工具每六小时和每天各跑一次，但只有有人执行发布命令并提交结果，数字才会变化。",
  "检查了零个对象的规则记为“跳过”，而不是“通过”。审计干净并不说明数据来源充分——只说明规则没有找到可检查的对象。",
  "发现只覆盖三个适配器（arXiv、GitHub、RSS/Atom 订阅源）。缺少线索说明覆盖不足，而不是没有相关工作。",
];

export function discoveredLeadNote(locale: string): string {
  return locale === "zh" ? DISCOVERED_LEAD_NOTE_ZH : DISCOVERED_LEAD_NOTE;
}

export function automationLimits(locale: string): string[] {
  return locale === "zh" ? AUTOMATION_LIMITS_ZH : AUTOMATION_LIMITS;
}
