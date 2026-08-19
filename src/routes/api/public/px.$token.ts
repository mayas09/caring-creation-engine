import { createFileRoute } from "@tanstack/react-router";

/**
 * Open-tracking pixel. An open recorded here is ESTIMATED, never confirmed:
 * image proxies and preview panes can load it without a human reading the email.
 */

const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/px/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String((params as { token?: string }).token ?? "").replace(/\.gif$/i, "");
        const respond = () =>
          new Response(new Uint8Array(GIF), {
            headers: {
              "Content-Type": "image/gif",
              "Cache-Control": "no-store, no-cache, must-revalidate, private",
            },
          });

        if (!UUID.test(token)) return respond();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: msg } = await supabaseAdmin
            .from("outreach_messages")
            .select("id,user_id,lead_id,open_count,opened_at,sent_at")
            .eq("tracking_token", token)
            .maybeSingle();
          if (!msg || !msg.sent_at) return respond();

          const now = new Date().toISOString();
          await supabaseAdmin
            .from("outreach_messages")
            .update({ opened_at: msg.opened_at ?? now, open_count: (msg.open_count ?? 0) + 1 })
            .eq("id", msg.id);
          await supabaseAdmin.from("delivery_events").insert({
            user_id: msg.user_id,
            lead_id: msg.lead_id,
            message_id: msg.id,
            event: "opened",
            label: "estimated",
            detail: "Tracking pixel loaded — estimated, not confirmed",
            occurred_at: now,
          });
        } catch {
          // Tracking must never break image delivery.
        }
        return respond();
      },
    },
  },
});
