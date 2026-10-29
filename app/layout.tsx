import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ds } from "@/lib/data";

export const metadata: Metadata = {
  title: {
    default: "Human's Last Dashboard",
    template: "%s · Human's Last Dashboard",
  },
  description:
    "Evidence-traceable monitoring of AGI progress and recursive self-improvement.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <div className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 md:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="border-b border-line p-5 md:sticky md:top-0 md:h-screen md:self-start md:border-b-0 md:border-r md:p-6">
            <Link href="/" className="block">
              <div className="font-serif text-lg font-semibold leading-tight">
                Human’s Last Dashboard
              </div>
              <div className="mt-1 text-xs text-muted">Evidence-traceable AGI progress monitor</div>
            </Link>
            <Nav />
            <p className="mt-8 hidden text-xs leading-5 text-muted md:block">
              A claim is not a finding. Every assessment links to inspectable evidence and states
              what it does not establish.
            </p>
          </aside>

          <div className="min-w-0">
            <div
              role="note"
              className="demo-hatch border-b border-warn/30 px-5 py-2 text-xs text-warn md:px-9"
            >
              <strong className="font-semibold">Demonstration data.</strong> Every record here is
              fictional and exists to exercise the interface. None of it is evidence about real AI
              systems.
            </div>
            <main id="main" className="px-5 py-8 md:px-9 md:py-10">
              {children}
            </main>
            <footer className="border-t border-line px-5 py-4 text-xs text-muted md:px-9">
              {ds.label}. L0–L7 is a working taxonomy for organizing evidence, not an established
              scale; no composite AGI score is computed.
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
