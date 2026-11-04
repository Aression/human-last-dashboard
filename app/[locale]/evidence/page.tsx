import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EvidenceExplorer } from "@/components/EvidenceExplorer";
import { Legend } from "@/components/Legend";
import { PageHeader } from "@/components/PageHeader";
import { selectorsFor } from "@/lib/data";
import { getDictionary, isLocale } from "@/lib/i18n";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  return { title: getDictionary(raw).meta.titles.evidence };
}

export default async function EvidencePage({ params }: Params) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const dict = getDictionary(locale);
  const { ds } = selectorsFor(locale);

  return (
    <div className="space-y-8">
      <PageHeader title={dict.meta.titles.evidence}>{dict.explorer.intro}</PageHeader>
      <EvidenceExplorer sources={ds.sources} claims={ds.claims} evidence={ds.evidence} locale={locale} />
      <Legend locale={locale} />
    </div>
  );
}
