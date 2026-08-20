import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceBadge } from "@/components/evidence/EvidenceBadge";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/evidence";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — sell.x" },
      {
        name: "description",
        content: "Conversion, evidence coverage and stage distribution — all calculated from stored data.",
      },
      { property: "og:title", content: "Analytics — sell.x" },
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
        supabase.from("leads").select("id,business_name,stage,classification,source,created_at"),
        supabase.from("evidence").select("id,type,checked_at"),
        supabase
          .from("outreach_messages")
          .select("id,status,sent_at,replied_at,verification_passed,override_logged,word_count"),
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
  const sent = messages.filter((m) => m.sent_at).length;
  const drafted = messages.length;
  const overrides = messages.filter((m) => m.override_logged).length;
  const passed = messages.filter((m) => m.verification_passed).length;
  const failed = messages.filter((m) => m.status === "failed").length;
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
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const header = "business_name,stage,classification,source,created_at";
              const rows = leads.map((l) =>
                [l.business_name, l.stage, l.classification, l.source ?? "unknown", l.created_at]
                  .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
                  .join(","),
              );
              download(
                new Blob([[header, ...rows].join("\n")], { type: "text/csv" }),
                "leads-export.csv",
              );
            }}
          >
            Export leads CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const payload = {
                exported_at: new Date().toISOString(),
                metrics: {
                  messages_sent: sent,
                  reply_rate_pct: replyRate === "—" ? null : Number(replyRate),
                  win_rate_pct: winRate === "—" ? null : Number(winRate),
                  evidence_coverage_pct: coverage,
                },
                leads: leads.map((l) => ({
                  business_name: l.business_name,
                  stage: l.stage,
                  classification: l.classification,
                  source: l.source ?? "unknown",
                  created_at: l.created_at,
                })),
                evidence: evidence.map((e) => ({
                  id: e.id,
                  type: e.type,
                  checked_at: e.checked_at,
                })),
              };
              download(
                new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
                "leadgen-export.json",
              );
            }}
          >
            Export JSON
          </Button>
        </div>

      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Messages sent" value={sent} formula="count(sent_at is not null)" />
        <Metric label="Reply rate" value={replyRate === "—" ? "Unknown" : `${replyRate}%`} formula="replied ÷ sent × 100" />
        <Metric label="Win rate" value={winRate === "—" ? "Unknown" : `${winRate}%`} formula="closed_won ÷ total leads × 100" />
        <Metric label="Evidence coverage" value={`${coverage}%`} formula="verified ÷ all claims × 100" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message quality</CardTitle>
          <CardDescription>
            Open and click rates are not tracked in this workspace, so they are reported as Unknown rather
            than estimated.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
          <Row label="Drafts created" value={drafted} note="count(outreach_messages)" />
          <Row label="Passed honesty check" value={`${passed}/${drafted}`} note="verification_passed" />
          <Row label="Sent with override" value={overrides} note="override_logged = true" />
          <Row label="Failed" value={failed} note="status = failed" />
          <Row label="Open rate" value="Unknown" note="no tracking pixel configured" />
          <Row label="Click rate" value="Unknown" note="no link tracking configured" />
        </CardContent>
      </Card>

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

function Row({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      <p className="font-mono text-[11px] text-muted-foreground">{note}</p>
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
