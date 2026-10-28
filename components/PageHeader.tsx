import type { ReactNode } from "react";

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="max-w-3xl">
      <h1 className="text-3xl leading-tight md:text-4xl">{title}</h1>
      {children && <div className="mt-3 text-[15px] leading-7 text-muted">{children}</div>}
    </header>
  );
}

export function SectionTitle({
  id,
  title,
  aside,
}: {
  id?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
      <h2 id={id} className="scroll-mt-6 text-xl">
        {title}
      </h2>
      {aside && <div className="text-xs text-muted">{aside}</div>}
    </div>
  );
}
