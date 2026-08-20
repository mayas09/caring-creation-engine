import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceBadge } from "@/components/evidence/EvidenceBadge";
import { addDncEntry } from "@/lib/discovery.functions";
import { listStaleEvidence, purgeExpiredData } from "@/lib/ops.functions";
import { runLeadAudit } from "@/lib/research.functions";
import { formatChecked } from "@/lib/evidence";

export const Route = createFileRoute("/_authenticated/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance — sell.x" },
      {
        name: "description",
        content:
          "Do-not-contact list, data retention purges and evidence freshness rechecks for honest, compliant outreach.",
      },
      { property: "og:title", content: "Compliance — sell.x" },
      {
        property: "og:description",
        content: "Manage DNC entries, retention purges and stale evidence rechecks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompliancePage,
});

function CompliancePage() {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<"email" | "phone" | "domain" | "business">("email");
  const [reason, setReason] = useState("");

  const addDnc = useServerFn(addDncEntry);
  const purge = useServerFn(purgeExpiredData);
  const stale = useServerFn(listStaleEvidence);
  const audit = useServerFn(runLeadAudit);

  const { data: entries = [] } = useQuery({
    queryKey: ["dnc"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dnc_entries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const staleQuery = useQuery({
    queryKey: ["stale-evidence"],
    queryFn: () => stale({ data: undefined }),
  });

  const add = useMutation({
    mutationFn: () =>
      addDnc({ data: { value: value.trim(), kind, ...(reason.trim() ? { reason: reason.trim() } : {}) } }),
    onSuccess: () => {
      toast.success("Added to do-not-contact list");
      setValue("");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["dnc"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dnc_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["dnc"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const runPurge = useMutation({
    mutationFn: () => purge({ data: undefined }),
    onSuccess: (r) =>
      toast.success(
        `Purged data older than ${r.retentionDays} days: ${r.activitiesDeleted} activity rows, ${r.chatDeleted} chat rows.`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  const recheck = useMutation({
    mutationFn: (leadId: string) => audit({ data: { leadId } }),
    onSuccess: () => {
      toast.success("Evidence rechecked — freshness timestamps updated.");
      void qc.invalidateQueries({ queryKey: ["stale-evidence"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
        <p className="text-sm text-muted-foreground">
          Consent, retention and evidence freshness. Nothing here is automatic — you decide each action.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Do-not-contact list</CardTitle>
            <CardDescription>
              Discovery and drafting both skip any lead matching an entry below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dnc-value">Value</Label>
              <Input
                id="dnc-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="name@example.com, +1555…, example.com"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dnc-kind">Type</Label>
                <select
                  id="dnc-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="domain">Domain</option>
                  <option value="business">Business name</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dnc-reason">Reason (optional)</Label>
                <Input
                  id="dnc-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Unsubscribed, asked to stop…"
                />
              </div>
            </div>
            <Button size="sm" disabled={value.trim().length < 2 || add.isPending} onClick={() => add.mutate()}>
              Add entry
            </Button>

            <div className="space-y-2 pt-2">
              {entries.length === 0 && (
                <p className="text-sm text-muted-foreground">No suppressed contacts recorded.</p>
              )}
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.kind} · {e.reason ?? "no reason recorded"} · {formatChecked(e.created_at)}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(e.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data retention</CardTitle>
              <CardDescription>
                Deletes activity and chat history older than the retention window set in Settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" disabled={runPurge.isPending} onClick={() => runPurge.mutate()}>
                {runPurge.isPending ? "Purging…" : "Purge expired records"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evidence freshness</CardTitle>
              <CardDescription>
                Claims checked more than 30 days ago. Recheck before reusing them in outreach.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {staleQuery.isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}
              {staleQuery.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">All stored evidence is within 30 days.</p>
              )}
              {(staleQuery.data ?? []).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      <EvidenceBadge type="unknown" /> {s.claim}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.code} · {s.leadName} · checked {formatChecked(s.checkedAt)}
                    </p>
                  </div>
                  {s.leadId && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" asChild>
                        <Link to="/leads" search={{ lead: s.leadId }}>
                          Open
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={recheck.isPending}
                        onClick={() => recheck.mutate(s.leadId!)}
                      >
                        Recheck
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
