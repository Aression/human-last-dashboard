import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { DemoTag, ModelTag, PolarityChip, ReviewChip, TierChip } from "@/components/chips";
import { ProvenancePanel } from "@/components/ProvenancePanel";
import { Statement, kindFromClaimType } from "@/components/Statement";
import {
  claimTypeLabel,
  evidenceTypeLabel,
  formatDate,
  sourceTypeLabel,
} from "@/lib/labels";
import {
  capabilitiesById,
  claimsById,
  claimsForEvidence,
  ds,
  evidenceById,
  evidenceForClaim,
  relatedForecasts,
  sourceOf,
  sourcesById,
} from "@/lib/selectors";

type Params = { id: string };

export function generateStaticParams(): Params[] {
  return [...ds.sources, ...ds.claims, ...ds.evidence].map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Record ${id}` };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-[14px] leading-6">{children}</dd>
    </div>
  );
}

export default async function RecordPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;

  const evidence = evidenceById.get(id);
  const claim = claimsById.get(id);
  const source = sourcesById.get(id);
  if (!evidence && !claim && !source) notFound();

  // ------------------------------------------------------------- evidence
  if (evidence) {
    const src = sourceOf(evidence);
    const claims = claimsForEvidence(evidence);
    const citedBy = ds.assessments.filter(
      (a) =>
        a.supporting_evidence_ids.includes(evidence.id) ||
        a.counterevidence_ids.includes(evidence.id),
    );
    const forecasts = relatedForecasts(evidence.id);
    return (
      <div className="space-y-10">
        <Link href="/evidence" className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
          ← Evidence Explorer
        </Link>
        <PageHeader title={`Evidence ${evidence.id}`}>
          <span className="flex flex-wrap items-center gap-2">
            <PolarityChip polarity={evidence.polarity} />
            <ReviewChip status={evidence.review_status} />
            <span className="text-xs">{evidenceTypeLabel[evidence.evidence_type]}</span>
            {evidence.provenance === "demo" && <DemoTag />}
          </span>
        </PageHeader>

        <Statement kind="fact" className="max-w-3xl text-base leading-7">
          {evidence.observation}
        </Statement>

        <dl className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <Field label="Method">{evidence.method}</Field>
          <Field label="Limitations">{evidence.limitations}</Field>
          <Field label="Reproducibility">{evidence.reproducibility_notes}</Field>
        </dl>

        <section className="space-y-3">
          <SectionTitle title="Source" />
          <Link href={`/evidence/${src.id}`} className="block max-w-3xl rounded-lg border border-line bg-surface p-4 hover:border-muted">
            <div className="font-serif text-base">{src.title}</div>
            <div className="mt-1 text-[13px] text-muted">{src.publisher}</div>
            <div className="mt-2">
              <TierChip source={src} />
            </div>
          </Link>
        </section>

        {claims.length > 0 && (
          <section className="space-y-3">
            <SectionTitle title="Claims this bears on" />
            <ul className="max-w-3xl space-y-3">
              {claims.map((c) => (
                <li key={c.id}>
                  <Statement kind={kindFromClaimType[c.claim_type]} model={Boolean(c.generated_by)}>
                    <Link href={`/evidence/${c.id}`} className="font-mono text-xs text-accent hover:underline">
                      {c.id}
                    </Link>{" "}
                    {c.statement}
                  </Statement>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <SectionTitle title="Used by" />
          <ul className="max-w-3xl space-y-2 text-[13px]">
            {citedBy.map((a) => {
              const cap = capabilitiesById.get(a.capability_id);
              return (
                <li key={a.id}>
                  <Link href={`/progress/${a.capability_id}`} className="underline-offset-4 hover:underline">
                    {cap?.level} {cap?.name}, assessment v{a.version}
                  </Link>
                </li>
              );
            })}
            {forecasts.map((f) => (
              <li key={f.id}>
                <Link href={`/research#${f.id}`} className="underline-offset-4 hover:underline">
                  Forecast {f.id}
                </Link>
              </li>
            ))}
            {citedBy.length + forecasts.length === 0 && (
              <li className="text-muted">Not cited by any assessment or forecast yet.</li>
            )}
          </ul>
        </section>

        <ProvenancePanel kind="evidence" record={evidence} />
      </div>
    );
  }

  // --------------------------------------------------------------- claim
  if (claim) {
    const src = sourceOf(claim);
    const linked = evidenceForClaim(claim.id);
    return (
      <div className="space-y-10">
        <Link href="/evidence" className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
          ← Evidence Explorer
        </Link>
        <PageHeader title={`Claim ${claim.id}`}>
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span>{claimTypeLabel[claim.claim_type]}</span>
            <span>· {claim.extraction_status.replace("-", " ")}</span>
            {claim.generated_by && <ModelTag model={claim.generated_by.model} />}
            {claim.provenance === "demo" && <DemoTag />}
          </span>
        </PageHeader>

        <Statement
          kind={kindFromClaimType[claim.claim_type]}
          model={Boolean(claim.generated_by)}
          className="max-w-3xl text-base leading-7"
        >
          {claim.statement}
        </Statement>
        <p className="max-w-3xl text-[13px] leading-6 text-muted">
          A claim records what a source asserts and how it is supported. It does not establish that
          the statement is true.
        </p>

        <dl className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <Field label="Source span">{claim.source_span}</Field>
          <Field label="Conditions">{claim.conditions}</Field>
          <Field label="Limitations">{claim.limitations}</Field>
        </dl>

        <section className="space-y-3">
          <SectionTitle title="Source" />
          <Link href={`/evidence/${src.id}`} className="block max-w-3xl rounded-lg border border-line bg-surface p-4 hover:border-muted">
            <div className="font-serif text-base">{src.title}</div>
            <div className="mt-2">
              <TierChip source={src} />
            </div>
          </Link>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Evidence bearing on this claim" />
          {linked.length === 0 ? (
            <p className="max-w-3xl text-sm text-muted">
              No evidence is linked. Until some is, this claim stays a lead.
            </p>
          ) : (
            <ul className="max-w-3xl space-y-3">
              {linked.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/evidence/${e.id}`} className="font-mono text-xs text-accent hover:underline">
                    {e.id}
                  </Link>
                  <PolarityChip polarity={e.polarity} />
                  <ReviewChip status={e.review_status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <ProvenancePanel kind="claim" record={claim} />
      </div>
    );
  }

  // -------------------------------------------------------------- source
  const s = source!;
  const claims = ds.claims.filter((c) => c.source_id === s.id);
  const evs = ds.evidence.filter((e) => e.source_id === s.id);
  return (
    <div className="space-y-10">
      <Link href="/evidence" className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
        ← Evidence Explorer
      </Link>
      <PageHeader title={s.title}>
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span>{sourceTypeLabel[s.source_type]}</span>
          <TierChip source={s} />
          {s.provenance === "demo" && <DemoTag />}
        </span>
      </PageHeader>

      <dl className="grid max-w-3xl gap-5 sm:grid-cols-2">
        <Field label="Publisher">{s.publisher}</Field>
        <Field label="Published">{formatDate(s.published_at)}</Field>
      </dl>

      {s.source_tier === "lead" && (
        <p className="max-w-3xl rounded-lg border border-dashed border-warn/40 px-4 py-3 text-[13px] leading-6 text-warn">
          This source is a lead. It can start an investigation but cannot support a stage upgrade on
          its own.
        </p>
      )}
      {s.developer_affiliated && s.source_tier !== "lead" && (
        <p className="max-w-3xl rounded-lg border border-dashed border-line px-4 py-3 text-[13px] leading-6 text-muted">
          The publisher built or operates the system described. Its results are primary evidence of
          what the developer reports, not independent validation.
        </p>
      )}

      <section className="space-y-3">
        <SectionTitle title="Claims" aside={`${claims.length}`} />
        <ul className="max-w-3xl space-y-3">
          {claims.map((c) => (
            <li key={c.id}>
              <Statement kind={kindFromClaimType[c.claim_type]} model={Boolean(c.generated_by)}>
                <Link href={`/evidence/${c.id}`} className="font-mono text-xs text-accent hover:underline">
                  {c.id}
                </Link>{" "}
                {c.statement}
              </Statement>
            </li>
          ))}
          {claims.length === 0 && <li className="text-sm text-muted">No claims extracted.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <SectionTitle title="Evidence" aside={`${evs.length}`} />
        <ul className="max-w-3xl space-y-3">
          {evs.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <Link href={`/evidence/${e.id}`} className="font-mono text-xs text-accent hover:underline">
                {e.id}
              </Link>
              <PolarityChip polarity={e.polarity} />
              <ReviewChip status={e.review_status} />
            </li>
          ))}
          {evs.length === 0 && <li className="text-sm text-muted">No evidence records.</li>}
        </ul>
      </section>

      <ProvenancePanel kind="source" record={s} />
    </div>
  );
}
