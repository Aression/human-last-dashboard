"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Overview" },
  { href: "/progress", label: "Progress" },
  { href: "/evidence", label: "Evidence Explorer" },
  { href: "/research", label: "Research & Attribution" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="mt-8 grid grid-cols-2 gap-1.5 md:grid-cols-1">
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
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
  );
}
