import { NextResponse, type NextRequest } from "next/server";

import { defaultLocale, isLocale, localePath, skipsLocaleRouting } from "@/lib/i18n";

/**
 * Every page lives under a locale prefix, so an unprefixed address is redirected
 * to the default locale (`/evidence?tab=claims` → `/en/evidence?tab=claims`).
 * Framework internals, API routes and static files are left alone.
 *
 * The redirect is permanent so the unprefixed form keeps working from links and
 * bookmarks without being re-resolved on every visit.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (skipsLocaleRouting(pathname)) return NextResponse.next();

  const [, first = ""] = pathname.split("/");
  if (isLocale(first)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = localePath(defaultLocale, pathname);
  return NextResponse.redirect(url);
}

// Must stay a literal: Next reads this at build time.
export const config = {
  matcher: ["/((?!_next/|api/|.*\\.[\\w]+$).*)"],
};
