import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { DemoTag, ModelTag, PolarityChip, ReviewChip, TierChip } from "@/components/chips";
import { ProvenancePanel } from "@/components/ProvenancePanel";
import { Statement, kindFromClaimType } from "@/components/Statement";
import { selectorsFor } from "@/lib/data";
import { fill, getDictionary, isLocale, locales, localePath } from "@/lib/i18n";
import { formatDate } from "@/lib/labels";

type Params = { locale: string; id: string };

/**
 * Record ids are identical across locales, so the same set is generated for each
 * one: the page is prerendered per locale and only its text differs.
 */
export function generateStaticParams(): Params[] {
  return locales.flatMap((locale) => {
    const { ds } = selectorsFor(locale);
    return [...ds.sources, ...ds.claims, ...ds.evidence].map((r) => ({ locale, id: r.id }));
  });
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) return {};
  return { title: fill(getDictionary(raw).meta.titles.record, { id }) };
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
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const dict = getDictionary(locale);
  const {
    ds,
    capabilitiesById,
    claimsById,
    claimsForEvidence,
    evidenceById,
    evidenceForClaim,
    relatedForecasts,
    sourceOf,
    sourcesById,
  } = selectorsFor(locale);

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
        <Link
          href={localePath(locale, "/evidence")}
          className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {dict.record.backToExplorer}
        </Link>
        <PageHeader title={fill(dict.record.evidenceTitle, { id: evidence.id })}>
          <span className="flex flex-wrap items-center gap-2">
            <PolarityChip polarity={evidence.polarity} locale={locale} />
            <ReviewChip status={evidence.review_status} locale={locale} />
            <span className="text-xs">{dict.labels.evidenceType[evidence.evidence_type]}</span>
            {evidence.provenance === "demo" && <DemoTag locale={locale} />}
          </span>
        </PageHeader>

        <Statement kind="fact" locale={locale} className="max-w-3xl text-base leading-7">
          {evidence.observation}
        </Statement>

        <dl className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <Field label={dict.record.method}>{evidence.method}</Field>
          <Field label={dict.record.limitations}>{evidence.limitations}</Field>
          <Field label={dict.record.reproducibility}>{evidence.reproducibility_notes}</Field>
        </dl>

        <section className="space-y-3">
          <SectionTitle title={dict.record.sourceSection} />
          <Link
            href={localePath(locale, `/evidence/${src.id}`)}
            className="block max-w-3xl rounded-lg border border-line bg-surface p-4 hover:border-muted"
          >
            <div className="font-serif text-base">{src.title}</div>
            <div className="mt-1 text-[13px] text-muted">{src.publisher}</div>
            <div className="mt-2">
              <TierChip source={src} locale={locale} />
            </div>
          </Link>
        </section>

        {claims.length > 0 && (
          <section className="space-y-3">
            <SectionTitle title={dict.record.claimsBearsOn} />
            <ul className="max-w-3xl space-y-3">
              {claims.map((c) => (
                <li key={c.id}>
                  <Statement
                    kind={kindFromClaimType[c.claim_type]}
                    model={Boolean(c.generated_by)}
                    locale={locale}
                  >
                    <Link
                      href={localePath(locale, `/evidence/${c.id}`)}
                      className="font-mono text-xs text-accent hover:underline"
                    >
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
          <SectionTitle title={dict.record.usedBy} />
          <ul className="max-w-3xl space-y-2 text-[13px]">
            {citedBy.map((a) => {
              const cap = capabilitiesById.get(a.capability_id);
              return (
                <li key={a.id}>
                  <Link
                    href={localePath(locale, `/progress/${a.capability_id}`)}
                    className="underline-offset-4 hover:underline"
                  >
                    {fill(dict.record.assessmentLink, {
                      level: cap?.level ?? "",
                      name: cap?.name ?? "",
                      version: a.version,
                    })}
                  </Link>
                </li>
              );
            })}
            {forecasts.map((f) => (
              <li key={f.id}>
                <Link
                  href={localePath(locale, `/research#${f.id}`)}
                  className="underline-offset-4 hover:underline"
                >
                  {fill(dict.record.forecastLink, { id: f.id })}
                </Link>
              </li>
            ))}
            {citedBy.length + forecasts.length === 0 && (
              <li className="text-muted">{dict.record.notCited}</li>
            )}
          </ul>
        </section>

        <ProvenancePanel kind="evidence" record={evidence} locale={locale} />
      </div>
    );
  }

  // --------------------------------------------------------------- claim
  if (claim) {
    const src = sourceOf(claim);
    const linked = evidenceForClaim(claim.id);
    return (
      <div className="space-y-10">
        <Link
          href={localePath(locale, "/evidence")}
          className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {dict.record.backToExplorer}
        </Link>
        <PageHeader title={fill(dict.record.claimTitle, { id: claim.id })}>
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span>{dict.labels.claimType[claim.claim_type]}</span>
            <span>· {dict.labels.extractionStatus[claim.extraction_status]}</span>
            {claim.generated_by && <ModelTag model={claim.generated_by.model} locale={locale} />}
            {claim.provenance === "demo" && <DemoTag locale={locale} />}
          </span>
        </PageHeader>

        <Statement
          kind={kindFromClaimType[claim.claim_type]}
          model={Boolean(claim.generated_by)}
          locale={locale}
          className="max-w-3xl text-base leading-7"
        >
          {claim.statement}
        </Statement>
        <p className="max-w-3xl text-[13px] leading-6 text-muted">{dict.record.claimNote}</p>

        <dl className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <Field label={dict.record.sourceSpan}>{claim.source_span}</Field>
          <Field label={dict.record.conditions}>{claim.conditions}</Field>
          <Field label={dict.record.limitations}>{claim.limitations}</Field>
        </dl>

        <section className="space-y-3">
          <SectionTitle title={dict.record.sourceSection} />
          <Link
            href={localePath(locale, `/evidence/${src.id}`)}
            className="block max-w-3xl rounded-lg border border-line bg-surface p-4 hover:border-muted"
          >
            <div className="font-serif text-base">{src.title}</div>
            <div className="mt-2">
              <TierChip source={src} locale={locale} />
            </div>
          </Link>
        </section>

        <section className="space-y-3">
          <SectionTitle title={dict.record.evidenceBearingOn} />
          {linked.length === 0 ? (
            <p className="max-w-3xl text-sm text-muted">{dict.record.noLinkedEvidence}</p>
          ) : (
            <ul className="max-w-3xl space-y-3">
              {linked.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={localePath(locale, `/evidence/${e.id}`)}
                    className="font-mono text-xs text-accent hover:underline"
                  >
                    {e.id}
                  </Link>
                  <PolarityChip polarity={e.polarity} locale={locale} />
                  <ReviewChip status={e.review_status} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <ProvenancePanel kind="claim" record={claim} locale={locale} />
      </div>
    );
  }

  // -------------------------------------------------------------- source
  const s = source!;
  const claims = ds.claims.filter((c) => c.source_id === s.id);
  const evs = ds.evidence.filter((e) => e.source_id === s.id);
  return (
    <div className="space-y-10">
      <Link
        href={localePath(locale, "/evidence")}
        className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        {dict.record.backToExplorer}
      </Link>
      <PageHeader title={s.title}>
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span>{dict.labels.sourceType[s.source_type]}</span>
          <TierChip source={s} locale={locale} />
          {s.provenance === "demo" && <DemoTag locale={locale} />}
        </span>
      </PageHeader>

      <dl className="grid max-w-3xl gap-5 sm:grid-cols-2">
        <Field label={dict.record.publisher}>{s.publisher}</Field>
        <Field label={dict.record.published}>{formatDate(s.published_at, locale)}</Field>
      </dl>

      {s.source_tier === "lead" && (
        <p className="max-w-3xl rounded-lg border border-dashed border-warn/40 px-4 py-3 text-[13px] leading-6 text-warn">
          {dict.record.leadSourceNote}
        </p>
      )}
      {s.developer_affiliated && s.source_tier !== "lead" && (
        <p className="max-w-3xl rounded-lg border border-dashed border-line px-4 py-3 text-[13px] leading-6 text-muted">
          {dict.record.developerSourceNote}
        </p>
      )}

      <section className="space-y-3">
        <SectionTitle title={dict.record.claims} aside={`${claims.length}`} />
        <ul className="max-w-3xl space-y-3">
          {claims.map((c) => (
            <li key={c.id}>
              <Statement
                kind={kindFromClaimType[c.claim_type]}
                model={Boolean(c.generated_by)}
                locale={locale}
              >
                <Link
                  href={localePath(locale, `/evidence/${c.id}`)}
                  className="font-mono text-xs text-accent hover:underline"
                >
                  {c.id}
                </Link>{" "}
                {c.statement}
              </Statement>
            </li>
          ))}
          {claims.length === 0 && <li className="text-sm text-muted">{dict.record.noClaims}</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <SectionTitle title={dict.record.evidence} aside={`${evs.length}`} />
        <ul className="max-w-3xl space-y-3">
          {evs.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <Link
                href={localePath(locale, `/evidence/${e.id}`)}
                className="font-mono text-xs text-accent hover:underline"
              >
                {e.id}
              </Link>
              <PolarityChip polarity={e.polarity} locale={locale} />
              <ReviewChip status={e.review_status} locale={locale} />
            </li>
          ))}
          {evs.length === 0 && <li className="text-sm text-muted">{dict.record.noEvidence}</li>}
        </ul>
      </section>

      <ProvenancePanel kind="source" record={s} locale={locale} />
    </div>
  );
}
