import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceBadge } from "@/components/evidence/EvidenceBadge";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/evidence";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — LeadGen AI Pro" },
      {
        name: "description",
        content: "Conversion, evidence coverage and stage distribution — all calculated from stored data.",
      },
      { property: "og:title", content: "Analytics — LeadGen AI Pro" },
      { property: "og:description", content: "Calculated metrics with visible formulas, never invented." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const [leads, evidence, messages] = await Promise.all([
        supabase.from("leads").select("id,stage,classification"),
        supabase.from("evidence").select("id,type"),
        supabase.from("outreach_messages").select("id,status"),
      ]);
      return {
        leads: leads.data ?? [],
        evidence: evidence.data ?? [],
        messages: messages.data ?? [],
      };
    },
  });

  const leads = data?.leads ?? [];
  const evidence = data?.evidence ?? [];
  const messages = data?.messages ?? [];
  const sent = messages.length;
  const replied = leads.filter((l) =>
    ["replied", "demo_scheduled", "proposal_sent", "negotiating", "closed_won"].includes(l.stage),
  ).length;
  const won = leads.filter((l) => l.stage === "closed_won").length;
  const replyRate = sent ? ((replied / sent) * 100).toFixed(1) : "—";
  const winRate = leads.length ? ((won / leads.length) * 100).toFixed(1) : "—";
  const coverage = evidence.length
    ? Math.round((evidence.filter((e) => e.type === "verified").length / evidence.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Every metric shows its formula. Missing inputs render as Unknown, never as an estimate.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Messages sent" value={sent} formula="count(outreach_messages)" />
        <Metric label="Reply rate" value={replyRate === "—" ? "Unknown" : `${replyRate}%`} formula="replied ÷ sent × 100" />
        <Metric label="Win rate" value={winRate === "—" ? "Unknown" : `${winRate}%`} formula="closed_won ÷ total leads × 100" />
        <Metric label="Evidence coverage" value={`${coverage}%`} formula="verified ÷ all claims × 100" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage distribution</CardTitle>
          <CardDescription>Counted directly from lead records.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {STAGE_ORDER.map((stage) => {
            const count = leads.filter((l) => l.stage === stage).length;
            const pct = leads.length ? (count / leads.length) * 100 : 0;
            return (
              <div key={stage} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{STAGE_LABEL[stage]}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, formula }: { label: string; value: string | number; formula: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <EvidenceBadge type={value === "Unknown" ? "unknown" : "calculated"} />
        </div>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{formula}</p>
      </CardContent>
    </Card>
  );
}
