import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wand2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ClaimRow, EvidenceBadge, FreshnessTag } from "@/components/evidence/EvidenceBadge";
import { CLASSIFICATION_LABEL, STAGE_LABEL, type EvidenceType } from "@/lib/evidence";
import { generateOutreach, runLeadAudit } from "@/lib/research.functions";

type DraftResult = { subject: string; body: string; passed: boolean; issues: string[] };

export function LeadDetail({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const draft = useServerFn(generateOutreach);
  const audit = useServerFn(runLeadAudit);
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [auditing, setAuditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      const [lead, evidence, signals, gap, friction] = await Promise.all([
        supabase.from("leads").select("*").eq("id", leadId).maybeSingle(),
        supabase.from("evidence").select("*").eq("lead_id", leadId).order("checked_at", { ascending: false }),
        supabase.from("signals").select("*").eq("lead_id", leadId),
        supabase.from("ordering_gaps").select("*").eq("lead_id", leadId).maybeSingle(),
        supabase.from("friction_points").select("*").eq("lead_id", leadId),
      ]);
      if (lead.error) throw lead.error;
      return {
        lead: lead.data,
        evidence: evidence.data ?? [],
        signals: signals.data ?? [],
        gap: gap.data,
        friction: friction.data ?? [],
      };
    },
  });

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading evidence…</p>;
  if (!data?.lead) return <p className="p-6 text-sm text-muted-foreground">Lead not found.</p>;

  const { lead, evidence, signals, gap, friction } = data;

  async function generate() {
    setBusy(true);
    try {
      const res = await draft({ data: { leadId, style: "short", ctaStyle: "soft" } });
      setEmail(res.content);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 p-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{lead.business_name}</h2>
        <p className="text-sm text-muted-foreground">
          {[lead.industry, lead.city, lead.country].filter(Boolean).join(" · ") || "Location unknown"}
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-muted-foreground">
          <span className="rounded border border-border px-1.5 py-0.5">
            {CLASSIFICATION_LABEL[lead.classification] ?? lead.classification}
          </span>
          <span className="rounded border border-border px-1.5 py-0.5">
            {STAGE_LABEL[lead.stage] ?? lead.stage}
          </span>
        </div>
      </header>

      <Section title="Contact & presence">
        <ClaimRow
          claim={lead.website ? `Website: ${lead.website}` : "Website not recorded"}
          type={lead.website ? "verified" : "unknown"}
          source={lead.website ? "Manual entry" : null}
        />
        <ClaimRow
          claim={lead.phone ? `Phone: ${lead.phone}` : "Phone not recorded"}
          type={lead.phone ? "verified" : "unknown"}
          source={lead.phone ? "Manual entry" : null}
        />
        <ClaimRow
          claim={lead.email ? `Email: ${lead.email}` : "Email not recorded"}
          type={lead.email ? "verified" : "unknown"}
          source={lead.email ? "Manual entry" : null}
        />
      </Section>

      <Section title="Direct ordering gap">
        {!gap && (
          <p className="text-sm text-muted-foreground">
            <EvidenceBadge type="unknown" /> No ordering audit recorded. Check the site menu and order
            button destination to fill this in.
          </p>
        )}
        {gap && (
          <div className="space-y-1">
            <ClaimRow claim="Website found" type={gap.website_found as EvidenceType} checkedAt={gap.checked_at} />
            <ClaimRow claim="Menu found" type={gap.menu_found as EvidenceType} checkedAt={gap.checked_at} />
            <ClaimRow
              claim="Online ordering available"
              type={gap.online_ordering as EvidenceType}
              checkedAt={gap.checked_at}
            />
            <ClaimRow
              claim={`Direct ordering${gap.order_button_destination ? ` → ${gap.order_button_destination}` : ""}`}
              type={gap.direct_ordering as EvidenceType}
              checkedAt={gap.checked_at}
            />
            {gap.third_party_platforms.length > 0 && (
              <p className="pt-1 text-xs text-muted-foreground">
                Third-party platforms: {gap.third_party_platforms.join(", ")}
              </p>
            )}
            {gap.gap_summary && <p className="pt-1 text-sm">{gap.gap_summary}</p>}
          </div>
        )}
      </Section>

      <Section title={`Signals (${signals.length})`}>
        {signals.length === 0 && (
          <p className="text-sm text-muted-foreground">No signals recorded yet.</p>
        )}
        {signals.map((s) => (
          <div key={s.id} className="border-b border-border/60 py-2 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{s.title}</span>
              <span className="text-[11px] text-muted-foreground">
                {s.strength} · confidence {s.confidence}
              </span>
            </div>
            {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
            {s.source && <p className="text-[11px] text-muted-foreground">Source: {s.source}</p>}
          </div>
        ))}
      </Section>

      <Section title={`Friction points (${friction.length})`}>
        {friction.length === 0 && (
          <p className="text-sm text-muted-foreground">No friction audit recorded.</p>
        )}
        {friction.map((f) => (
          <div key={f.id} className="border-b border-border/60 py-2 text-sm last:border-0">
            <p>{f.point}</p>
            <p className="text-[11px] text-muted-foreground">
              level {f.level}
              {f.source ? ` · source: ${f.source}` : ""}
              {f.evidence_code ? ` · ${f.evidence_code}` : ""}
            </p>
          </div>
        ))}
      </Section>

      <Section title={`Evidence ledger (${evidence.length})`}>
        {evidence.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No evidence entries. Claims without evidence stay Unknown.
          </p>
        )}
        {evidence.map((e) => (
          <div key={e.id} className="border-b border-border/60 py-2 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <EvidenceBadge type={e.type as EvidenceType} code={e.evidence_code} />
              <span className="text-sm">{e.claim}</span>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              {e.source && <span>Source: {e.source}</span>}
              {e.method && <span>Method: {e.method}</span>}
              <FreshnessTag checkedAt={e.checked_at} />
            </div>
          </div>
        ))}
      </Section>

      <Separator />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void runAudit()} disabled={auditing}>
            <Search className="size-4" /> {auditing ? "Auditing…" : "Run evidence audit"}
          </Button>
          <Button size="sm" onClick={() => void generate()} disabled={busy || lead.do_not_contact}>
            <Wand2 className="size-4" /> {busy ? "Drafting…" : "Draft verified outreach"}
          </Button>
        </div>
        {lead.do_not_contact && (
          <p className="text-xs text-danger">Marked do-not-contact — outreach is blocked.</p>
        )}
        {draftResult && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium">{draftResult.subject}</p>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed">{draftResult.body}</pre>
            <div
              className={
                draftResult.passed
                  ? "rounded border border-success/30 bg-success/10 p-2 text-xs text-success"
                  : "rounded border border-warning/30 bg-warning/10 p-2 text-xs text-warning"
              }
            >
              {draftResult.passed ? (
                <p>Verification passed — no unsupported numbers, no hype.</p>
              ) : (
                <ul className="list-disc pl-4">
                  {draftResult.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Saved to the outbox as {draftResult.passed ? "verified" : "draft"}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="rounded-md border border-border p-3">{children}</div>
    </section>
  );
}
