"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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

const TABS: Tab[] = ["evidence", "claims", "sources"];

/**
 * The explorer's whole state, so it can live in the query string and a filtered
 * view can be linked to. `/evidence?tab=claims&tier=independent&q=benchmark`.
 */
interface ExplorerState {
  tab: Tab;
  q: string;
  tier: string;
  polarity: string;
  review: string;
  claimType: string;
}

/** Defaults are omitted from the URL, so a link only carries what was chosen. */
const DEFAULT_STATE: ExplorerState = {
  tab: "evidence",
  q: "",
  tier: ALL,
  polarity: ALL,
  review: ALL,
  claimType: ALL,
};

/** A facet is only read back from the URL when it names a value this build knows. */
function facet<T extends string>(raw: string | null, options: Record<T, string>): string {
  return raw && Object.prototype.hasOwnProperty.call(options, raw) ? raw : ALL;
}

function parseState(search: string): ExplorerState {
  const params = new URLSearchParams(search);
  const tab = params.get("tab") as Tab | null;
  return {
    tab: tab && TABS.includes(tab) ? tab : DEFAULT_STATE.tab,
    q: params.get("q") ?? "",
    tier: facet(params.get("tier"), sourceTierLabel),
    polarity: facet(params.get("polarity"), polarityLabel),
    review: facet(params.get("review"), reviewStatusLabel),
    claimType: facet(params.get("claimType"), claimTypeLabel),
  };
}

function serializeState(state: ExplorerState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_STATE.tab) params.set("tab", state.tab);
  if (state.q) params.set("q", state.q);
  if (state.tier !== ALL) params.set("tier", state.tier);
  if (state.polarity !== ALL) params.set("polarity", state.polarity);
  if (state.review !== ALL) params.set("review", state.review);
  if (state.claimType !== ALL) params.set("claimType", state.claimType);
  return params.toString();
}

/** The query keys this explorer owns; everything else in the URL is left alone. */
const STATE_KEYS = ["tab", "q", "tier", "polarity", "review", "claimType"] as const;

/** Writes the state over `params`, dropping keys it no longer sets and keeping the rest. */
function writeState(params: URLSearchParams, state: ExplorerState): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of STATE_KEYS) next.delete(key);
  const own = new URLSearchParams(serializeState(state));
  own.forEach((value, key) => next.set(key, value));
  return next;
}

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
  const [state, setState] = useState<ExplorerState>(DEFAULT_STATE);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<number | undefined>(undefined);
  const searchId = useId();

  const { tab, q, tier, polarity, review, claimType } = state;

  // The page is prerendered with the default state, so the query string can only
  // be applied in the browser. Reading it here (rather than with useSearchParams)
  // keeps the whole record list in the prerendered HTML and needs no Suspense
  // boundary, so /evidence stays statically rendered with its content.
  useEffect(() => {
    const apply = () => setState(parseState(window.location.search));
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  /**
   * Every state change is mirrored into the URL. `replaceState` rather than the
   * router: this page is prerendered, so there is no server state to refetch and a
   * soft navigation per keystroke would be wasted. Replacing (not pushing) keeps
   * Back pointing at the previous page instead of walking through filters, and the
   * entry's existing history state is passed through so Next's own restoration of
   * this page on Back/Forward keeps working.
   */
  const commit = (next: ExplorerState) => {
    setState(next);
    const { pathname, search: current, hash } = window.location;
    const search = writeState(new URLSearchParams(current), next).toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search ? `?${search}` : ""}${hash}`,
    );
  };

  const copyLink = async () => {
    const search = writeState(new URLSearchParams(window.location.search), state).toString();
    const { origin, pathname, hash } = window.location;
    const url = `${origin}${pathname}${search ? `?${search}` : ""}${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied("idle"), 4000);
  };

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

  const clear = () => commit({ ...DEFAULT_STATE, tab });
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
            onClick={() => commit({ ...state, tab: t.id })}
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
            onChange={(e) => commit({ ...state, q: e.target.value })}
            placeholder="Observation, method, source, id"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm placeholder:text-muted/70"
          />
        </div>
        <Select
          label="Source tier"
          value={tier}
          onChange={(v) => commit({ ...state, tier: v })}
          options={sourceTierLabel}
        />
        {tab === "evidence" && (
          <>
            <Select
              label="Polarity"
              value={polarity}
              onChange={(v) => commit({ ...state, polarity: v })}
              options={polarityLabel}
            />
            <Select
              label="Review status"
              value={review}
              onChange={(v) => commit({ ...state, review: v })}
              options={reviewStatusLabel}
            />
          </>
        )}
        {tab === "claims" && (
          <Select
            label="Claim type"
            value={claimType}
            onChange={(v) => commit({ ...state, claimType: v })}
            options={claimTypeLabel}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-muted">
        <span aria-live="polite">
          {counts[tab]} of{" "}
          {tab === "evidence" ? evidence.length : tab === "claims" ? claims.length : sources.length} shown
        </span>
        <span className="flex items-center gap-3">
          <span role="status" aria-live="polite" className="text-accent">
            {copied === "copied"
              ? "Link copied"
              : copied === "failed"
                ? "Copy failed — copy the address bar instead"
                : ""}
          </span>
          <button
            type="button"
            onClick={copyLink}
            title="Copy a link that restores these filters"
            className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-muted hover:text-ink"
          >
            Copy link
          </button>
          {filtered && (
            <button onClick={clear} className="underline underline-offset-4 hover:text-ink">
              Clear filters
            </button>
          )}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted">
        A shared link carries its filters in the URL; they are applied once the page has loaded.
      </p>

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
