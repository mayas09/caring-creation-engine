import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/evidence";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/integrations/supabase/types";

type Stage = Database["public"]["Enums"]["lead_stage"];

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline — LeadGen AI Pro" },
      {
        name: "description",
        content: "Kanban pipeline from New to Closed-Won, with evidence-backed stage moves.",
      },
      { property: "og:title", content: "Pipeline — LeadGen AI Pro" },
      { property: "og:description", content: "Track every lead from research to closed-won." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PipelinePage,
});

function PipelinePage() {
  const qc = useQueryClient();
  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stage updated");
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Drag a card onto a column to move it. Stage changes are logged.
        </p>
      </header>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGE_ORDER.map((stage) => {
          const items = leads.filter((l) => l.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (id) move.mutate({ id, stage: stage as Stage });
              }}
              className="w-64 shrink-0 rounded-lg border border-border bg-card/40 p-2"
            >
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium">
                <span>{STAGE_LABEL[stage]}</span>
                <span className="text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((l) => (
                  <Card
                    key={l.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <CardContent className="space-y-1 p-3">
                      <p className="truncate text-sm font-medium">{l.business_name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {l.city ?? "Unknown city"} · priority {l.priority}
                      </p>
                    </CardContent>
                  </Card>
                ))}
                {items.length === 0 && (
                  <p className="px-1 py-4 text-[11px] text-muted-foreground">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
