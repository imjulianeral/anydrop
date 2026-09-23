import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function DocLinks() {
  return (
    <nav
      aria-label="About AnyShare"
      className="text-muted-foreground flex items-center gap-4 text-sm"
    >
      <Link className="hover:text-foreground" to="/security">
        Security
      </Link>
      <Link className="hover:text-foreground" to="/about">
        About
      </Link>
    </nav>
  );
}

export function DocPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <main className="bg-background text-foreground flex min-h-svh flex-col px-6 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-12">
        <header>
          <Link to="/" className="text-sm font-medium">
            Home
          </Link>
        </header>
        <article className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              {lead}
            </p>
          </div>
          {children}
        </article>
      </div>
      <footer className="mt-auto flex justify-end pt-12">
        <DocLinks />
      </footer>
    </main>
  );
}

export function DocSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="text-muted-foreground flex flex-col gap-3 text-base leading-relaxed">
        {children}
      </div>
    </section>
  );
}
