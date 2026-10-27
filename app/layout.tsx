import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Human's Last Dashboard",
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
      <body>{children}</body>
    </html>
  );
}
