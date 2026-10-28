import Link from "next/link";
import type { Evidence, Source } from "@/lib/types";
import { evidenceTypeLabel } from "@/lib/labels";
import { DemoTag, PolarityChip, ReviewChip, TierChip } from "./chips";
import { Statement } from "./Statement";

export function EvidenceCard({ e, source }: { e: Evidence; source: Source }) {
  return (
    <article id={e.id} className="scroll-mt-6 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/evidence/${e.id}`}
          className="font-mono text-xs text-accent underline-offset-4 hover:underline"
        >
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

      <p className="mt-3 text-[13px] leading-5 text-muted">
        <span className="text-ink">Limitations.</span> {e.limitations}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
        <Link
          href={`/evidence/${source.id}`}
          className="underline-offset-4 hover:text-ink hover:underline"
        >
          {source.title}
        </Link>
        <TierChip source={source} />
      </div>
    </article>
  );
}
