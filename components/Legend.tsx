import { getDictionary, type Locale } from "@/lib/i18n";
import { EvidenceKey } from "./charts/EvidenceKey";
import { Statement } from "./Statement";

/**
 * Explains the visual grammar once, wherever a page leans on it. `collapsible`
 * folds it behind its title for pages whose charts already carry their own key:
 * the explanation stays one click away instead of competing with the data.
 */
export function Legend({
  evidence = false,
  locale = "en",
  collapsible = false,
}: {
  evidence?: boolean;
  locale?: Locale;
  collapsible?: boolean;
}) {
  const dict = getDictionary(locale);
  const body = (
    <>
      <div className="grid gap-3 text-[13px] sm:grid-cols-2">
        <Statement kind="fact" locale={locale}>
          {dict.legend.fact}
        </Statement>
        <Statement kind="interp" locale={locale}>
          {dict.legend.interp}
        </Statement>
        <Statement kind="spec" locale={locale}>
          {dict.legend.spec}
        </Statement>
        <Statement kind="forecast" locale={locale}>
          {dict.legend.forecast}
        </Statement>
        <Statement kind="fact" model locale={locale} className="sm:col-span-2">
          {dict.legend.model}
        </Statement>
      </div>
      {evidence && (
        <div className="mt-4 border-t border-line pt-3">
          <EvidenceKey locale={locale} />
        </div>
      )}
    </>
  );

  if (collapsible) {
    return (
      <details className="group reveal-details rounded-lg border border-line bg-surface">
        <summary className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <h2 className="text-sm">{dict.legend.title}</h2>
          <span
            aria-hidden="true"
            className="text-muted transition-transform group-open:rotate-90"
          >
            ▸
          </span>
        </summary>
        <div className="reveal-body px-4 pb-4">{body}</div>
      </details>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm">{dict.legend.title}</h2>
      <div className="mt-3">{body}</div>
    </div>
  );
}
