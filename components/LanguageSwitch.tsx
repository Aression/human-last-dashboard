"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { getDictionary, localePath, locales, stripLocale, type Locale } from "@/lib/i18n";

/** The current address without its locale prefix, so a switch keeps the filters. */
function currentPath(): string {
  const { pathname, search, hash } = window.location;
  return `${stripLocale(pathname)?.path ?? pathname}${search}${hash}`;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

/**
 * Switches language in place: the locale-free path is kept, with any query or
 * fragment, so a filtered Evidence Explorer stays filtered after the switch.
 *
 * The address is read through `useSyncExternalStore` instead of
 * `useSearchParams`, because these pages are prerendered and that hook would
 * require a Suspense boundary above every consumer. The server snapshot is the
 * section root; React re-reads the real address once hydrated.
 */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const rest = useSyncExternalStore(subscribe, currentPath, () => "/");

  return (
    <div className="mt-6 flex items-center gap-1.5 text-xs">
      {locales.map((option) => {
        const active = option === locale;
        const name = option === "en" ? dict.language.english : dict.language.chinese;
        const title =
          option === "en" ? dict.language.switchToEnglish : dict.language.switchToChinese;
        return (
          <Link
            key={option}
            href={localePath(option, rest)}
            hrefLang={option}
            lang={option}
            aria-current={active ? "true" : undefined}
            title={title}
            className={`rounded border px-1.5 py-0.5 transition-colors ${
              active
                ? "border-accent/60 text-ink"
                : "border-transparent text-muted hover:bg-white/[0.04] hover:text-ink"
            }`}
          >
            {name}
          </Link>
        );
      })}
    </div>
  );
}
