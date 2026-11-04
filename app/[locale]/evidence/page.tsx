import type { Metadata } from "next";
import { EvidenceExplorer } from "@/components/EvidenceExplorer";
import { Legend } from "@/components/Legend";
import { PageHeader } from "@/components/PageHeader";
import { ds } from "@/lib/data";

export const metadata: Metadata = { title: "Evidence Explorer" };

export default function EvidencePage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Evidence Explorer">
        Browse sources, the claims extracted from them, and the evidence that bears on each
        capability. A claim records what a source asserts; it is not a finding until evidence has
        been reviewed.
      </PageHeader>
      <EvidenceExplorer sources={ds.sources} claims={ds.claims} evidence={ds.evidence} />
      <Legend />
    </div>
  );
}
