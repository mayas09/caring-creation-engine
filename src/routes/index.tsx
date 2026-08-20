import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Search, FileSearch, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "sell.x — Evidence-first lead generation" },
      {
        name: "description",
        content:
          "Find local businesses with real ordering gaps, label every claim with a source, and send outreach you can defend.",
      },
      { property: "og:title", content: "sell.x — Evidence-first lead generation" },
      {
        property: "og:description",
        content: "Verified, Calculated, Inferred or Unknown — every claim carries its evidence ID.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  {
    icon: Search,
    title: "Research, not guessing",
    body: "Every lead starts as Unknown. Facts appear only once a source is recorded.",
  },
  {
    icon: FileSearch,
    title: "Evidence ledger",
    body: "Each claim gets a type, source, method, freshness and an evidence ID like EV-2026-0413-004.",
  },
  {
    icon: Gauge,
    title: "Honest metrics",
    body: "Calculated numbers show their formula. Missing inputs stay Unknown — never estimated.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <ShieldCheck className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">sell.x</span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20">
        <section className="py-16">
          <p className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            Signals, not truths
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Evidence-first lead generation for people who hate making things up.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Audit direct-ordering gaps, log friction points, and draft outreach that only references what
            you can prove. Every claim is labeled Verified, Calculated, Inferred or Unknown.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/auth">Start researching</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <Card key={p.title}>
              <CardContent className="space-y-2 pt-6">
                <p.icon className="size-5 text-primary" />
                <h2 className="text-base font-medium">{p.title}</h2>
                <p className="text-sm text-muted-foreground">{p.body}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
