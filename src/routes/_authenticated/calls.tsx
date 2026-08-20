import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { logCall } from "@/lib/voice.functions";

export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({
    meta: [
      { title: "Calls — sell.x" },
      {
        name: "description",
        content:
          "Evidence-labeled call scripts, transcripts and summaries that separate verified facts from what the lead said.",
      },
      { property: "og:title", content: "Calls — sell.x" },
      { property: "og:description", content: "Call scripts and summaries with explicit evidence labels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CallsPage,
});

type Summary = {
  verified?: string[];
  stated_by_lead?: string[];
  unknown?: string[];
  next_action?: string;
};

function CallsPage() {
  const qc = useQueryClient();
  const submit = useServerFn(logCall);
  const [open, setOpen] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);

  const { data: calls = [] } = useQuery({
    queryKey: ["calls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("*, leads(business_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function save(callId: string) {
    setBusy(true);
    try {
      await submit({ data: { callId, transcript, durationSeconds: duration } });
      toast.success("Call summarized with evidence labels.");
      setTranscript("");
      setOpen(null);
      void qc.invalidateQueries({ queryKey: ["calls"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
        <p className="text-sm text-muted-foreground">
          Scripts are built from verified evidence only. Generate one from any lead, then log the transcript
          here. Identity disclosure and "I'd need to check that" are built into every script.
        </p>
      </header>

      {calls.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No calls yet. Open a lead and use "Call script" to prepare one.
        </p>
      )}

      {calls.map((c) => {
        const summary = (c.summary ?? null) as Summary | null;
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <PhoneCall className="mr-1 inline size-4" />
                {(c.leads as { business_name?: string } | null)?.business_name ?? "Lead"}
              </CardTitle>
              <CardDescription>
                {c.result} · accent {c.accent} · recording {c.recording_enabled ? "on (configured)" : "off"}
                {c.duration_seconds ? ` · ${c.duration_seconds}s` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border p-3 text-xs leading-relaxed">
                {c.script}
              </pre>

              {summary && (
                <div className="space-y-2 rounded-md border border-border p-3 text-xs">
                  <Bucket title="VERIFIED" items={summary.verified ?? []} tone="text-success" />
                  <Bucket
                    title="STATED BY LEAD (not verified)"
                    items={summary.stated_by_lead ?? []}
                    tone="text-warning"
                  />
                  <Bucket title="UNKNOWN" items={summary.unknown ?? []} tone="text-muted-foreground" />
                  {summary.next_action && <p className="pt-1">Next action: {summary.next_action}</p>}
                </div>
              )}

              {open === c.id ? (
                <div className="space-y-2">
                  <Label>Transcript</Label>
                  <Textarea rows={6} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
                  <div className="flex items-end gap-2">
                    <div className="space-y-1">
                      <Label>Duration (s)</Label>
                      <Input
                        type="number"
                        className="w-28"
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value) || 0)}
                      />
                    </div>
                    <Button size="sm" disabled={busy} onClick={() => void save(c.id)}>
                      {busy ? "Summarizing…" : "Save & summarize"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setOpen(c.id)}>
                  Log transcript
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Bucket({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`font-medium ${tone}`}>{title}</p>
      <ul className="list-disc pl-4">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
