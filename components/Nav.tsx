"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { getDictionary, localePath, stripLocale, type Locale } from "@/lib/i18n";

export function Nav({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const pathname = usePathname();
  // The route tree is mounted under the locale prefix, so the active check has
  // to compare against the locale-free path ("/zh/evidence" → "/evidence").
  const current = stripLocale(pathname)?.path ?? pathname;

  const items = [
    { href: "/", label: dict.nav.overview },
    { href: "/progress", label: dict.nav.progress },
    { href: "/evidence", label: dict.nav.evidence },
    { href: "/automation", label: dict.nav.automation },
    { href: "/research", label: dict.nav.research },
  ];

  return (
    <>
      <nav aria-label={dict.nav.primary} className="mt-8 grid grid-cols-2 gap-1.5 md:grid-cols-1">
        {items.map((item) => {
          const active = item.href === "/" ? current === "/" : current.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={localePath(locale, item.href)}
              aria-current={active ? "page" : undefined}
              className={`rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-accent bg-white/[0.06] text-ink"
                  : "border-transparent text-muted hover:bg-white/[0.04] hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <LanguageSwitch locale={locale} />
    </>
  );
}
