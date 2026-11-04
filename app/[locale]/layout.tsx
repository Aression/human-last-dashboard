import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../globals.css";
import { Nav } from "@/components/Nav";
import { getDictionary, htmlLang, isLocale, locales, localePath } from "@/lib/i18n";

/**
 * The shell for every page, one prerendered tree per locale.
 *
 * Locales are URL prefixes (`/en/…`, `/zh/…`) rather than a cookie, because the
 * whole site is statically generated: a header-driven language would ship one
 * language's HTML and swap it on the client. Here the HTML a crawler or a
 * no-JS reader gets is already in the right language.
 */

type Params = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const dict = getDictionary(raw);
  return {
    title: {
      default: dict.meta.titles.overview,
      template: dict.meta.titleTemplate,
    },
    description: dict.meta.description,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const dict = getDictionary(locale);

  return (
    <html lang={htmlLang[locale]}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-2"
        >
          {dict.common.skipToContent}
        </a>
        <div className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 md:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="border-b border-line p-5 md:sticky md:top-0 md:h-screen md:self-start md:border-b-0 md:border-r md:p-6">
            <Link href={localePath(locale, "/")} className="block">
              <div className="font-serif text-lg font-semibold leading-tight">
                {dict.common.siteName}
              </div>
              <div className="mt-1 text-xs text-muted">{dict.common.tagline}</div>
            </Link>
            <Nav locale={locale} />
            <p className="mt-8 hidden text-xs leading-5 text-muted md:block">
              {dict.common.sidebarNote}
            </p>
          </aside>

          <div className="min-w-0">
            {/*
              This banner used to say "Demonstration data" while the app rendered a
              fictional fixture. It now renders curated records, so it says that —
              including the part a reader needs most: no human has reviewed them.
            */}
            <div
              role="note"
              className="demo-hatch border-b border-warn/30 px-5 py-2 text-xs text-warn md:px-9"
            >
              <strong className="font-semibold">{dict.common.curationBannerTitle}</strong>{" "}
              {dict.common.curationBanner}
            </div>
            <main id="main" className="px-5 py-8 md:px-9 md:py-10">
              {children}
            </main>
            <footer className="border-t border-line px-5 py-4 text-xs text-muted md:px-9">
              {dict.common.datasetLabel}. {dict.common.footer}
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
