import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { LeadDetail } from "@/components/leads/LeadDetail";
import { EvidenceBadge } from "@/components/evidence/EvidenceBadge";
import { CLASSIFICATION_LABEL, STAGE_LABEL } from "@/lib/evidence";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Leads — sell.x" },
      {
        name: "description",
        content:
          "Browse leads with evidence cards: verified signals, ordering gaps and friction points, each with a source.",
      },
      { property: "og:title", content: "Leads — sell.x" },
      { property: "og:description", content: "Evidence cards for every lead, with sources and freshness." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { lead?: string } =>
    typeof search["lead"] === "string" ? { lead: search["lead"] } : {},
  component: LeadsPage,
});

function LeadsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const search = Route.useSearch();
  const [openLead, setOpenLead] = useState<string | null>(search.lead ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ business_name: "", city: "", website: "", phone: "", industry: "" });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addLead = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("leads").insert({
        user_id: auth.user.id,
        business_name: form.business_name.trim(),
        city: form.city.trim() || null,
        website: form.website.trim() || null,
        phone: form.phone.trim() || null,
        industry: form.industry.trim() || null,
      });
      if (error) throw error;
      await supabase.from("activities").insert({
        user_id: auth.user.id,
        kind: "lead_created",
        description: `Lead added: ${form.business_name.trim()}`,
      });
    },
    onSuccess: () => {
      toast.success("Lead added — no claims recorded yet (all fields Unknown until verified).");
      setForm({ business_name: "", city: "", website: "", phone: "", industry: "" });
      setAddOpen(false);
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = leads.filter((l) =>
    `${l.business_name} ${l.city ?? ""} ${l.industry ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Nothing here is a truth claim until it carries a source and an evidence ID.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Add lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add lead</DialogTitle>
              <DialogDescription>
                Only enter what you actually observed. Everything else stays Unknown.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {(
                [
                  ["business_name", "Business name"],
                  ["city", "City"],
                  ["industry", "Industry"],
                  ["website", "Website"],
                  ["phone", "Phone"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                onClick={() => addLead.mutate()}
                disabled={!form.business_name.trim() || addLead.isPending}
              >
                Save lead
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search business, city, industry…"
          className="pl-9"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading leads…</p>}
      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No leads match. Add your first research target to begin the evidence trail.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((l) => (
          <button key={l.id} onClick={() => setOpenLead(l.id)} className="text-left">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.business_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[l.industry, l.city].filter(Boolean).join(" · ") || "Location unknown"}
                    </p>
                  </div>
                  <EvidenceBadge type={l.website ? "verified" : "unknown"} />
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded border border-border px-1.5 py-0.5">
                    {CLASSIFICATION_LABEL[l.classification] ?? l.classification}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5">
                    {STAGE_LABEL[l.stage] ?? l.stage}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5">
                    priority: {l.priority}
                  </span>
                  {l.do_not_contact && (
                    <span className="rounded border border-danger/40 px-1.5 py-0.5 text-danger">
                      Do not contact
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <Sheet open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {openLead && <LeadDetail leadId={openLead} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
