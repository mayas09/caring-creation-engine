import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { markMessageSent } from "@/lib/research.functions";
import { queueMessage, runFinalVerification, sendOutreachEmail } from "@/lib/ops.functions";
import { formatChecked } from "@/lib/evidence";

export const Route = createFileRoute("/_authenticated/outbox")({
  head: () => ({
    meta: [
      { title: "Outbox — LeadGen AI Pro" },
      {
        name: "description",
        content:
          "Review every outreach draft, its verification result and the evidence codes behind each claim before sending.",
      },
      { property: "og:title", content: "Outbox — LeadGen AI Pro" },
      {
        property: "og:description",
        content: "Verified outreach drafts with evidence codes and honesty checks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OutboxPage,
});

type Verification = { passed: boolean; issues: string[]; wordCount: number } | null;

function OutboxPage() {
  const qc = useQueryClient();
  const send = useServerFn(markMessageSent);
  const queueFn = useServerFn(queueMessage);
  const sendNowFn = useServerFn(sendOutreachEmail);

  const sendNow = useMutation({
    mutationFn: (vars: { id: string; override: boolean }) =>
      sendNowFn({ data: { messageId: vars.id, override: vars.override } }),
    onSuccess: (r) => {
      toast.success(`Email delivered to ${r.to}`);
      void qc.invalidateQueries({ queryKey: ["outbox"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recheckFn = useServerFn(runFinalVerification);

  const queue = useMutation({
    mutationFn: (id: string) => queueFn({ data: { messageId: id } }),
    onSuccess: (r) => {
      if (r.queued) {
        toast.success(`Queued. ${r.note ?? ""}`);
        void qc.invalidateQueries({ queryKey: ["outbox"] });
      } else {
        toast.error(r.issues.join(" · "));
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recheck = useMutation({
    mutationFn: (id: string) => recheckFn({ data: { messageId: id } }),
    onSuccess: (r) =>
      r.passed
        ? toast.success(`Final check passed for ${r.codes.length} evidence codes.`)
        : toast.warning(r.issues.join(" · ")),
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["outbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_messages")
        .select("*, leads(business_name, city)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const mark = useMutation({
    mutationFn: async (vars: { id: string; override: boolean }) =>
      send({ data: { messageId: vars.id, override: vars.override } }),
    onSuccess: () => {
      toast.success("Marked as sent");
      void qc.invalidateQueries({ queryKey: ["outbox"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Outbox</h1>
        <p className="text-sm text-muted-foreground">
          Nothing leaves here unverified without a logged override.
        </p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading drafts…</p>}
      {!isLoading && messages.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No drafts yet — generate verified outreach from a lead.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {messages.map((m) => {
          const v = m.verification as Verification;
          const lead = m.leads as { business_name?: string; city?: string | null } | null;
          return (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle className="text-base">{m.subject ?? "(no subject)"}</CardTitle>
                <CardDescription>
                  {lead?.business_name ?? "Unknown lead"} · {m.status} · {formatChecked(m.created_at)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-relaxed">
                  {m.body}
                </pre>
                <p className="text-[11px] text-muted-foreground">
                  Evidence used: {m.evidence_codes.length ? m.evidence_codes.join(", ") : "none"} ·{" "}
                  {m.word_count ?? 0} words
                </p>
                {v && !v.passed && (
                  <ul className="list-disc rounded border border-warning/30 bg-warning/10 p-2 pl-6 text-xs text-warning">
                    {v.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                )}
                {v?.passed && (
                  <p className="rounded border border-success/30 bg-success/10 p-2 text-xs text-success">
                    Verification passed.
                  </p>
                )}
                {m.status !== "sent" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={recheck.isPending}
                      onClick={() => recheck.mutate(m.id)}
                    >
                      Final evidence check
                    </Button>
                    {m.status !== "queued" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={queue.isPending}
                        onClick={() => queue.mutate(m.id)}
                      >
                        Queue send
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={sendNow.isPending || !m.verification_passed || !lead?.email}
                      onClick={() => sendNow.mutate({ id: m.id, override: false })}
                    >
                      {sendNow.isPending ? "Sending…" : "Send email now"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={mark.isPending || !m.verification_passed}
                      onClick={() => mark.mutate({ id: m.id, override: false })}
                    >
                      Mark sent manually
                    </Button>
                    {!m.verification_passed && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mark.isPending}
                        onClick={() => mark.mutate({ id: m.id, override: true })}
                      >
                        Send with logged override
                      </Button>
                    )}

                  </div>
                )}
                {m.override_logged && (
                  <p className="text-[11px] text-danger">Sent with a verification override on record.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
