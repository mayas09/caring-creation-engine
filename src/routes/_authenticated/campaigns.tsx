import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateBump } from "@/lib/ops.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — LeadGen AI Pro" },
      {
        name: "description",
        content: "Plan outreach campaigns with daily send caps, evidence requirements and honest copy.",
      },
      { property: "og:title", content: "Campaigns — LeadGen AI Pro" },
      { property: "og:description", content: "Outreach campaigns built on verified evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"email" | "call" | "sms" | "dm">("email");
  const bumpFn = useServerFn(generateBump);

  const { data: silentLeads = [] } = useQuery({
    queryKey: ["silent-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,business_name,stage,bump_count,last_contacted_at")
        .in("stage", ["sent", "ghost"])
        .order("last_contacted_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const bump = useMutation({
    mutationFn: (leadId: string) => bumpFn({ data: { leadId } }),
    onSuccess: (r) => {
      if (!r.drafted) {
        toast.error(r.reason ?? "Bump not drafted");
        return;
      }
      toast.success("Bump drafted — review it in the Outbox before sending.");
      void qc.invalidateQueries({ queryKey: ["outbox"] });
      void qc.invalidateQueries({ queryKey: ["silent-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("campaigns")
        .insert({ user_id: auth.user.id, name: name.trim(), channel });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign created");
      setName("");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Small batches, real evidence, no hype. Quality beats volume.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> New campaign
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cname">Name</Label>
                <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cchannel">Channel</Label>
                <select
                  id="cchannel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as typeof channel)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="email">Email</option>
                  <option value="call">Call</option>
                  <option value="sms">SMS</option>
                  <option value="dm">DM</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {campaigns.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No campaigns yet.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-base">{c.name}</CardTitle>
              <CardDescription>
                {c.channel} · {c.is_active ? "Active" : "Paused"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>{c.description ?? "No description recorded."}</p>
              <SequenceSteps campaignId={c.id} steps={(c.steps as Step[] | null) ?? []} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Follow-up bumps</CardTitle>
          <CardDescription>
            Bumps reuse only stored evidence. The limit follows your aggressiveness setting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {silentLeads.length === 0 && (
            <p className="text-sm text-muted-foreground">No contacted leads awaiting a follow-up.</p>
          )}
          {silentLeads.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.business_name}</p>
                <p className="text-xs text-muted-foreground">
                  {l.stage} · bumps sent: {l.bump_count ?? 0} ·{" "}
                  {l.last_contacted_at
                    ? `last contact ${new Date(l.last_contacted_at).toLocaleDateString()}`
                    : "no contact recorded"}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={bump.isPending} onClick={() => bump.mutate(l.id)}>
                Draft bump
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

type Step = { day: number; channel: string; purpose: string };

function SequenceSteps({ campaignId, steps }: { campaignId: string; steps: Step[] }) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<Step[]>(steps);

  const save = useMutation({
    mutationFn: async (next: Step[]) => {
      const { error } = await supabase.from("campaigns").update({ steps: next }).eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sequence saved");
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 border-t border-border/60 pt-2">
      <p className="font-medium text-foreground">Sequence</p>
      {local.length === 0 && <p>No steps yet — every send still needs manual approval.</p>}
      {local.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            className="h-8 w-16"
            value={s.day}
            onChange={(e) => {
              const next = [...local];
              next[i] = { ...s, day: Number(e.target.value) };
              setLocal(next);
            }}
          />
          <span>day</span>
          <Input
            className="h-8 flex-1"
            value={s.purpose}
            placeholder="Purpose (e.g. evidence recap)"
            onChange={(e) => {
              const next = [...local];
              next[i] = { ...s, purpose: e.target.value };
              setLocal(next);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLocal(local.filter((_, idx) => idx !== i))}
          >
            ×
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLocal([...local, { day: local.length * 3, channel: "email", purpose: "" }])}
        >
          Add step
        </Button>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(local)}>
          Save sequence
        </Button>
      </div>
    </div>
  );
}
