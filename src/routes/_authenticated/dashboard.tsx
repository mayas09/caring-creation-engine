import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EvidenceBadge } from "@/components/evidence/EvidenceBadge";
import { CLASSIFICATION_LABEL, STAGE_LABEL, formatChecked } from "@/lib/evidence";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — LeadGen AI Pro" },
      {
        name: "description",
        content:
          "Pipeline health, evidence coverage and today's verified opportunities in one evidence-first dashboard.",
      },
      { property: "og:title", content: "Dashboard — LeadGen AI Pro" },
      { property: "og:description", content: "Pipeline health and evidence coverage at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [leads, evidence, activities] = await Promise.all([
        supabase
          .from("leads")
          .select("id,business_name,city,classification,stage,priority,created_at,do_not_contact")
          .order("created_at", { ascending: false }),
        supabase.from("evidence").select("id,type,checked_at"),
        supabase
          .from("activities")
          .select("id,kind,description,created_at")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      if (leads.error) throw leads.error;
      return {
        leads: leads.data ?? [],
        evidence: evidence.data ?? [],
        activities: activities.data ?? [],
      };
    },
  });

  const leads = data?.leads ?? [];
  const evidence = data?.evidence ?? [];
  const verified = evidence.filter((e) => e.type === "verified").length;
  const unknown = evidence.filter((e) => e.type === "unknown").length;
  const coverage = evidence.length ? Math.round((verified / evidence.length) * 100) : 0;
  const opportunities = leads.filter((l) =>
    ["opportunity", "strong_opportunity", "medium_opportunity"].includes(l.classification),
  ).length;
  const contacted = leads.filter((l) =>
    ["sent", "replied", "demo_scheduled", "proposal_sent", "negotiating"].includes(l.stage),
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signals, not truths. Numbers below are Calculated from your stored evidence.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/leads">Open leads</Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total leads" value={leads.length} type="verified" hint="Rows stored in your workspace" />
        <Stat
          label="Opportunities"
          value={opportunities}
          type="calculated"
          hint="Classified as opportunity tiers"
        />
        <Stat label="In contact" value={contacted} type="calculated" hint="Stage sent → negotiating" />
        <Stat
          label="Evidence coverage"
          value={`${coverage}%`}
          type="calculated"
          hint={`${verified} verified / ${evidence.length} claims · ${unknown} unknown`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Newest leads</CardTitle>
            <CardDescription>Most recently added research targets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && leads.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No leads yet — add one from the Leads page to start the evidence trail.
              </p>
            )}
            {leads.slice(0, 6).map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.business_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.city ?? "Unknown city"} · {CLASSIFICATION_LABEL[l.classification] ?? l.classification}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {STAGE_LABEL[l.stage] ?? l.stage}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity log</CardTitle>
            <CardDescription>Every action is recorded with a timestamp.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.activities ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            )}
            {(data?.activities ?? []).map((a) => (
              <div key={a.id} className="border-b border-border/60 pb-2 text-sm last:border-0">
                <p>{a.description}</p>
                <p className="text-[11px] text-muted-foreground">
                  {a.kind} · {formatChecked(a.created_at)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  type,
}: {
  label: string;
  value: string | number;
  hint: string;
  type: "verified" | "calculated";
}) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <EvidenceBadge type={type} />
        </div>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
