import type { Claim, Evidence, Source } from "@/lib/types";
import { formatDate } from "@/lib/labels";
import { fill, getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import { DemoTag } from "./chips";
import { SectionTitle } from "./PageHeader";

/**
 * What a record is made of, taken only from the fields it actually stores.
 * A field that is missing is shown as missing: no URL, retrieval time, hash, or
 * snapshot is ever implied to exist for a record that does not carry one.
 * See AGENTS.md rules 2, 3 and 10 and docs/evidence-model.md.
 */
type ProvenanceRecord =
  | { kind: "evidence"; record: Evidence }
  | { kind: "claim"; record: Claim }
  | { kind: "source"; record: Source };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-[14px] leading-6">{children}</dd>
    </div>
  );
}

/** The only styling a missing value gets: readable, and unmistakably absent. */
function NotRecorded({ children }: { children: React.ReactNode }) {
  return <span className="text-muted italic">{children}</span>;
}

/**
 * `generatedByValue` carries the attribution as one sentence, but the workflow
 * version keeps its `<code>` styling, so the template is split around
 * `{workflow}` and the version is rendered between the two halves.
 */
function GeneratedBy({
  model,
  workflow,
  template,
}: {
  model: string;
  workflow: string;
  template: string;
}) {
  const [lead = template, tail = ""] = template.split("{workflow}");
  return (
    <span>
      {fill(lead, { model })}
      <code className="font-mono text-xs">{workflow}</code>
      {tail}
    </span>
  );
}

/**
 * What a given record does not establish. Shown for every record so the panel
 * cannot be read as a verification badge (AGENTS.md rules 3 and 4).
 */
function doesNotEstablish(kind: ProvenanceRecord["kind"], dict: Dictionary): string {
  const p = dict.provenance;
  if (kind === "evidence") return p.doesNotEstablishEvidence;
  if (kind === "claim") return p.doesNotEstablishClaim;
  return p.doesNotEstablishSource;
}

export function ProvenancePanel(props: ProvenanceRecord & { locale?: Locale }) {
  const { record, locale = "en" } = props;
  const dict = getDictionary(locale);
  const p = dict.provenance;
  const demo = record.provenance === "demo";

  return (
    <section className="space-y-3">
      <SectionTitle title={p.sectionTitle} aside={dict.labels.provenance[record.provenance]} />
      <div className="max-w-3xl rounded-lg border border-line bg-surface p-4">
        {demo && (
          <p className="demo-hatch mb-4 rounded-md border border-warn/40 px-3 py-2 text-[13px] leading-6 text-warn">
            {p.demoNote}
          </p>
        )}

        <dl className="grid gap-4 sm:grid-cols-2">
          <Row label={p.recordId}>
            <code className="font-mono text-xs">{record.id}</code>
          </Row>
          <Row label={p.provenanceRow}>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span>{dict.labels.provenance[record.provenance]}</span>
              {demo && <DemoTag locale={locale} />}
            </span>
          </Row>
          <Row label={p.created}>{formatDate(record.created_at, locale)}</Row>
          <Row label={p.generatedBy}>
            {record.generated_by ? (
              <GeneratedBy
                model={record.generated_by.model}
                workflow={record.generated_by.workflow_version}
                template={p.generatedByValue}
              />
            ) : (
              <NotRecorded>{p.noAttribution}</NotRecorded>
            )}
          </Row>

          {props.kind === "source" && (
            <>
              <Row label={p.publisher}>{props.record.publisher}</Row>
              <Row label={p.authors}>
                {props.record.authors.length > 0 ? (
                  props.record.authors.join(", ")
                ) : (
                  <NotRecorded>{p.noneRecorded}</NotRecorded>
                )}
              </Row>
              <Row label={p.published}>
                {props.record.published_at ? (
                  formatDate(props.record.published_at, locale)
                ) : (
                  <NotRecorded>{p.notRecorded}</NotRecorded>
                )}
              </Row>
              <Row label={p.canonicalUrl}>
                {props.record.canonical_url ? (
                  <a
                    href={props.record.canonical_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all underline underline-offset-4 hover:text-ink"
                  >
                    {props.record.canonical_url}
                  </a>
                ) : (
                  <NotRecorded>{p.noUrl}</NotRecorded>
                )}
              </Row>
              <Row label={p.retrievedAt}>
                {props.record.retrieved_at ? (
                  formatDate(props.record.retrieved_at, locale)
                ) : (
                  <NotRecorded>{p.noRetrievedAt}</NotRecorded>
                )}
              </Row>
              <Row label={p.contentHash}>
                {props.record.content_hash ? (
                  <code className="font-mono text-xs">{props.record.content_hash}</code>
                ) : (
                  <NotRecorded>{p.noHash}</NotRecorded>
                )}
              </Row>
              <Row label={p.snapshot}>
                <NotRecorded>{p.noSnapshot}</NotRecorded>
              </Row>
              <Row label={p.status}>{dict.labels.sourceStatus[props.record.status]}</Row>
              <Row label={p.sourceType}>{dict.labels.sourceType[props.record.source_type]}</Row>
              <Row label={p.sourceTier}>{dict.labels.sourceTier[props.record.source_tier]}</Row>
              <Row label={p.developerAffiliated}>
                {props.record.developer_affiliated ? p.affiliatedYes : p.affiliatedNo}
              </Row>
            </>
          )}
        </dl>

        <p className="mt-4 border-t border-line pt-3 text-[13px] leading-6 text-muted">
          <span className="text-ink">{p.doesNotEstablishTitle}</span>{" "}
          {doesNotEstablish(props.kind, dict)}
        </p>
      </div>
    </section>
  );
}
