/**
 * Locale plumbing shared by the middleware, the shell components and the pages.
 *
 * Locales are a URL prefix (`/en/...`, `/zh/...`), so every page keeps a single
 * canonical address per language and the prerendered HTML never depends on a
 * request header. This module holds no React and no Next imports so it can be
 * used from `middleware.ts` (edge runtime) and tested in plain Node.
 */

import { en, type Dictionary } from "./en";
import { zh } from "./zh";

export type { Dictionary };

/** Supported locales, in the order the switcher shows them. */
export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];

/** The locale used when a path carries none. `en` is the existing interface. */
export const defaultLocale: Locale = "en";

const dictionaries: Record<Locale, Dictionary> = { en, zh };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** The `lang` attribute for a locale's `<html>` element. */
export const htmlLang: Record<Locale, string> = { en: "en", zh: "zh-Hans" };

export function alternateLocale(locale: Locale): Locale {
  return locale === "en" ? "zh" : "en";
}

/**
 * Prefix a locale-free path with its locale, preserving any query or fragment:
 * `localePath("zh", "/evidence?tab=claims")` → `/zh/evidence?tab=claims`.
 */
export function localePath(locale: Locale, path: string): string {
  const [pathname = "", ...rest] = path.split(/(?=[?#])/);
  const suffix = rest.join("");
  const clean =
    pathname === "" || pathname === "/"
      ? ""
      : pathname.startsWith("/")
        ? pathname
        : `/${pathname}`;
  return `/${locale}${clean}${suffix}`;
}

/**
 * Split a leading locale segment off a pathname. Returns `null` when the path
 * carries no locale, so callers can distinguish "already localised" from
 * "needs a redirect".
 */
export function stripLocale(pathname: string): { locale: Locale; path: string } | null {
  const [, first = "", ...rest] = pathname.split("/");
  if (!isLocale(first)) return null;
  const path = `/${rest.join("/")}`;
  return { locale: first, path: path === "/" ? "/" : path.replace(/\/$/, "") };
}

/** The locale a pathname is served under, defaulting when it has none. */
export function localeFromPathname(pathname: string): Locale {
  return stripLocale(pathname)?.locale ?? defaultLocale;
}

/**
 * Paths the middleware must never redirect: framework internals, API routes and
 * static files all live outside the locale tree.
 */
export function skipsLocaleRouting(pathname: string): boolean {
  if (pathname.startsWith("/_next/") || pathname === "/_next") return true;
  if (pathname.startsWith("/api/") || pathname === "/api") return true;
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

/**
 * Fill `{name}` placeholders. Unknown placeholders are left intact so a missing
 * value shows up in the interface instead of silently rendering "undefined".
 */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
