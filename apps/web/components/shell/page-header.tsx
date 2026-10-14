import type { ReactNode } from "react";

export function PageHeader({ title, lede, aside }: { title: string; lede?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h1>
        {lede && <p className="text-muted-foreground mt-2 text-pretty">{lede}</p>}
      </div>
      {aside}
    </div>
  );
}
