/**
 * Wording shared by the tooling that writes `data/automation/snapshot.json` and
 * the page that renders it, kept in its own module so neither has to import the
 * other (and so the tooling does not pull the app's dataset into a build step).
 */

/** Stored inside every snapshot; the page prints it verbatim. */
export const DISCOVERED_LEAD_NOTE =
  "A discovered lead is a pointer to a page that exists, with the retrieval facts that were actually observed. It is not evidence, it is not part of the dataset, and it is not shown on the Evidence Explorer.";

/** What a reader must not conclude from the automation page. */
export const AUTOMATION_LIMITS: string[] = [
  "Nothing on this page has been reviewed by a human or promoted into the dataset. A lead becomes evidence only through a separate, reviewed edit, and the tooling cannot make that edit.",
  "A retrieval hash proves which bytes were fetched, not that the page is correct, current, or relevant to the capability it was discovered for.",
  "A page fetched with an error status (for example HTTP 429) is stored as a lead with the error recorded; no summary was extracted from the error page.",
  "The page renders the last published snapshot, not live state. The tool runs every six hours and every day, but the numbers stop changing until someone runs the publish command and commits the result.",
  "A rule that inspected zero subjects is reported as skipped, not as passed. A clean audit does not mean the dataset is well sourced — it means the rules found nothing they could test.",
  "Discovery is limited to three adapters (arXiv, GitHub, RSS/Atom feeds). Absence of a lead is absence of coverage, not absence of work.",
];
