import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
            <CardContent className="text-xs text-muted-foreground">
              {c.description ?? "No description recorded."}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
