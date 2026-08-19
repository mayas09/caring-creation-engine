import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Mailgun webhook + inbound-route receiver.
 * Records provider-confirmed delivery facts (delivered / bounced / complained)
 * and inbound replies. Every write is signature-verified first.
 */

type Signature = { timestamp?: string | undefined; token?: string | undefined; signature?: string | undefined };

function verify(sig: Signature): boolean {
  const key = process.env["MAILGUN_WEBHOOK_SIGNING_KEY"];
  if (!key || !sig.timestamp || !sig.token || !sig.signature) return false;
  const expected = createHmac("sha256", key).update(`${sig.timestamp}${sig.token}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const EVENT_MAP: Record<string, "delivered" | "bounced" | "complained" | "opened" | "unsubscribed"> = {
  delivered: "delivered",
  failed: "bounced",
  rejected: "bounced",
  complained: "complained",
  opened: "opened",
  unsubscribed: "unsubscribed",
};

export const Route = createFileRoute("/api/public/mailgun-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentType = request.headers.get("content-type") ?? "";
        const raw = await request.text();

        let signature: Signature = {};
        let event: Record<string, unknown> = {};
        let inbound: Record<string, string> = {};

        if (contentType.includes("application/json")) {
          const parsed = JSON.parse(raw) as {
            signature?: Signature;
            "event-data"?: Record<string, unknown>;
          };
          signature = parsed.signature ?? {};
          event = parsed["event-data"] ?? {};
        } else {
          const form = new URLSearchParams(raw);
          signature = {
            timestamp: form.get("timestamp") ?? undefined,
            token: form.get("token") ?? undefined,
            signature: form.get("signature") ?? undefined,
          };
          inbound = Object.fromEntries(form.entries());
        }

        if (!verify(signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // --- Inbound reply (Mailgun Route forwarding) ---------------------------
        if (!contentType.includes("application/json")) {
          const from = (inbound["sender"] ?? "").toLowerCase().trim();
          if (!from) return new Response("ok");
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("id,user_id,business_name")
            .ilike("email", from)
            .maybeSingle();
          if (!lead) return new Response("ok");

          const repliedAt = new Date().toISOString();
          const { data: msg } = await supabaseAdmin
            .from("outreach_messages")
            .select("id")
            .eq("lead_id", lead.id)
            .not("sent_at", "is", null)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (msg) {
            await supabaseAdmin
              .from("outreach_messages")
              .update({ replied_at: repliedAt, status: "replied" })
              .eq("id", msg.id);
          }
          await supabaseAdmin.from("leads").update({ stage: "replied" }).eq("id", lead.id);
          await supabaseAdmin.from("delivery_events").insert({
            user_id: lead.user_id,
            lead_id: lead.id,
            message_id: msg?.id ?? null,
            event: "replied",
            label: "verified",
            detail: (inbound["subject"] ?? "").slice(0, 200),
            payload: { from, stripped_text: (inbound["stripped-text"] ?? "").slice(0, 4000) },
          });
          await supabaseAdmin.from("activities").insert({
            user_id: lead.user_id,
            lead_id: lead.id,
            kind: "reply",
            description: `Reply received from ${from} (confirmed by inbound email route).`,
            metadata: { subject: inbound["subject"] ?? "" },
          });
          return new Response("ok");
        }

        // --- Delivery events -----------------------------------------------------
        const rawEvent = String(event["event"] ?? "");
        const kind = EVENT_MAP[rawEvent];
        if (!kind) return new Response("ok");

        const message = event["message"] as { headers?: { "message-id"?: string } } | undefined;
        const providerId = message?.headers?.["message-id"];
        if (!providerId) return new Response("ok");

        const { data: row } = await supabaseAdmin
          .from("outreach_messages")
          .select("id,user_id,lead_id,open_count")
          .or(`provider_message_id.eq.${providerId},provider_message_id.eq.<${providerId}>`)
          .maybeSingle();
        if (!row) return new Response("ok");

        const at = new Date(
          typeof event["timestamp"] === "number" ? (event["timestamp"] as number) * 1000 : Date.now(),
        ).toISOString();
        const reason =
          (event["delivery-status"] as { message?: string; description?: string } | undefined)?.message ??
          (event["reason"] as string | undefined) ??
          null;

        const update: {
          delivered_at?: string;
          bounced_at?: string;
          bounce_reason?: string | null;
          status?: "failed";
        } = {};
        if (kind === "delivered") update.delivered_at = at;
        if (kind === "bounced") {
          update.bounced_at = at;
          update.bounce_reason = reason;
          update.status = "failed";
        }
        if (Object.keys(update).length > 0) {
          await supabaseAdmin.from("outreach_messages").update(update).eq("id", row.id);
        }
        if (kind === "complained" || kind === "unsubscribed") {
          await supabaseAdmin.from("leads").update({ do_not_contact: true }).eq("id", row.lead_id);
        }

        await supabaseAdmin.from("delivery_events").insert({
          user_id: row.user_id,
          lead_id: row.lead_id,
          message_id: row.id,
          event: kind,
          label: kind === "opened" ? "estimated" : "verified",
          detail: reason,
          payload: { provider_event: rawEvent },
          occurred_at: at,
        });

        return new Response("ok");
      },
    },
  },
});
