"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { Claim, Evidence, Source } from "@/lib/types";
import {
  claimTypeLabel,
  evidenceTypeLabel,
  formatDate,
  polarityLabel,
  reviewStatusLabel,
  sourceTierLabel,
  sourceTypeLabel,
} from "@/lib/labels";
import { DemoTag, ModelTag, PolarityChip, ReviewChip, TierChip } from "./chips";
import { Statement, kindFromClaimType } from "./Statement";

type Tab = "evidence" | "claims" | "sources";

interface Props {
  sources: Source[];
  claims: Claim[];
  evidence: Evidence[];
}

const ALL = "all";

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<T, string>;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
      >
        <option value={ALL}>All</option>
        {(Object.entries(options) as [T, string][]).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

export function EvidenceExplorer({ sources, claims, evidence }: Props) {
  const [tab, setTab] = useState<Tab>("evidence");
  const [q, setQ] = useState("");
  const searchId = useId();

  // facets
  const [polarity, setPolarity] = useState(ALL);
  const [review, setReview] = useState(ALL);
  const [tier, setTier] = useState(ALL);
  const [claimType, setClaimType] = useState(ALL);

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const needle = q.trim().toLowerCase();
  const hit = (...parts: (string | null)[]) =>
    !needle || parts.some((p) => p?.toLowerCase().includes(needle));

  const evidenceRows = useMemo(
    () =>
      evidence.filter((e) => {
        const s = sourceById.get(e.source_id);
        return (
          (polarity === ALL || e.polarity === polarity) &&
          (review === ALL || e.review_status === review) &&
          (tier === ALL || s?.source_tier === tier) &&
          hit(e.observation, e.method, e.limitations, e.id, s?.title ?? null, s?.publisher ?? null)
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evidence, polarity, review, tier, needle, sourceById],
  );

  const claimRows = useMemo(
    () =>
      claims.filter((c) => {
        const s = sourceById.get(c.source_id);
        return (
          (claimType === ALL || c.claim_type === claimType) &&
          (tier === ALL || s?.source_tier === tier) &&
          hit(c.statement, c.conditions, c.limitations, c.id, s?.title ?? null)
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claims, claimType, tier, needle, sourceById],
  );

  const sourceRows = useMemo(
    () =>
      sources.filter(
        (s) =>
          (tier === ALL || s.source_tier === tier) &&
          hit(s.title, s.publisher, s.id, sourceTypeLabel[s.source_type]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources, tier, needle],
  );

  const counts: Record<Tab, number> = {
    evidence: evidenceRows.length,
    claims: claimRows.length,
    sources: sourceRows.length,
  };
  const tabs: { id: Tab; label: string }[] = [
    { id: "evidence", label: "Evidence" },
    { id: "claims", label: "Claims" },
    { id: "sources", label: "Sources" },
  ];

  const clear = () => {
    setQ("");
    setPolarity(ALL);
    setReview(ALL);
    setTier(ALL);
    setClaimType(ALL);
  };
  const filtered = needle || polarity !== ALL || review !== ALL || tier !== ALL || claimType !== ALL;

  return (
    <div>
      <div role="tablist" aria-label="Record type" className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="explorer-panel"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === t.id
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label} <span className="tabular-nums text-xs text-muted">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <label htmlFor={searchId} className="block text-xs text-muted">
            Search
          </label>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Observation, method, source, id"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm placeholder:text-muted/70"
          />
        </div>
        <Select label="Source tier" value={tier} onChange={setTier} options={sourceTierLabel} />
        {tab === "evidence" && (
          <>
            <Select label="Polarity" value={polarity} onChange={setPolarity} options={polarityLabel} />
            <Select label="Review status" value={review} onChange={setReview} options={reviewStatusLabel} />
          </>
        )}
        {tab === "claims" && (
          <Select label="Claim type" value={claimType} onChange={setClaimType} options={claimTypeLabel} />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted" aria-live="polite">
        <span>
          {counts[tab]} of{" "}
          {tab === "evidence" ? evidence.length : tab === "claims" ? claims.length : sources.length} shown
        </span>
        {filtered && (
          <button onClick={clear} className="underline underline-offset-4 hover:text-ink">
            Clear filters
          </button>
        )}
      </div>

      <div id="explorer-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-4 space-y-3">
        {counts[tab] === 0 && (
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Nothing matches these filters.{" "}
            <button onClick={clear} className="underline underline-offset-4 hover:text-ink">
              Clear filters
            </button>{" "}
            to see every record.
          </p>
        )}

        {tab === "evidence" &&
          evidenceRows.map((e) => {
            const s = sourceById.get(e.source_id)!;
            return (
              <article key={e.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/evidence/${e.id}`} className="font-mono text-xs text-accent underline-offset-4 hover:underline">
                    {e.id}
                  </Link>
                  <PolarityChip polarity={e.polarity} />
                  <ReviewChip status={e.review_status} />
                  <span className="text-xs text-muted">{evidenceTypeLabel[e.evidence_type]}</span>
                  {e.provenance === "demo" && <DemoTag />}
                </div>
                <Statement kind="fact" className="mt-3 text-[15px] leading-6">
                  {e.observation}
                </Statement>
                <p className="mt-2 text-[13px] leading-5 text-muted">
                  <span className="text-ink">Method.</span> {e.method}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-muted">
                  <span className="text-ink">Limitations.</span> {e.limitations}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
                  <Link href={`/evidence/${s.id}`} className="underline-offset-4 hover:text-ink hover:underline">
                    {s.title}
                  </Link>
                  <TierChip source={s} />
                </div>
              </article>
            );
          })}

        {tab === "claims" &&
          claimRows.map((c) => {
            const s = sourceById.get(c.source_id)!;
            return (
              <article key={c.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Link href={`/evidence/${c.id}`} className="font-mono text-accent underline-offset-4 hover:underline">
                    {c.id}
                  </Link>
                  <span className="text-muted">{claimTypeLabel[c.claim_type]}</span>
                  <span className="text-muted">· {c.extraction_status.replace("-", " ")}</span>
                  {c.generated_by && <ModelTag model={c.generated_by.model} />}
                  {c.provenance === "demo" && <DemoTag />}
                </div>
                <Statement
                  kind={kindFromClaimType[c.claim_type]}
                  model={Boolean(c.generated_by)}
                  className="mt-3 text-[15px] leading-6"
                >
                  {c.statement}
                </Statement>
                <p className="mt-2 text-[13px] leading-5 text-muted">
                  <span className="text-ink">Limitations.</span> {c.limitations}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
                  <Link href={`/evidence/${s.id}`} className="underline-offset-4 hover:text-ink hover:underline">
                    {s.title}
                  </Link>
                  <TierChip source={s} />
                </div>
              </article>
            );
          })}

        {tab === "sources" &&
          sourceRows.map((s) => (
            <article key={s.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Link href={`/evidence/${s.id}`} className="font-mono text-accent underline-offset-4 hover:underline">
                  {s.id}
                </Link>
                <span className="text-muted">{sourceTypeLabel[s.source_type]}</span>
                <TierChip source={s} />
                {s.provenance === "demo" && <DemoTag />}
              </div>
              <h3 className="mt-2 font-serif text-base">{s.title}</h3>
              <p className="mt-1 text-[13px] text-muted">
                {s.publisher} · published {formatDate(s.published_at)} · status {s.status}
              </p>
            </article>
          ))}
      </div>
    </div>
  );
}
