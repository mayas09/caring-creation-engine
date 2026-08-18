import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const leadSchema = z.object({ leadId: z.string().uuid() });

export const runLeadAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => leadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { auditLead } = await import("./research.server");
    return auditLead(context.supabase, context.userId, data.leadId);
  });

const draftSchema = z.object({
  leadId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  style: z.enum(["short", "medium", "detailed"]).default("short"),
  ctaStyle: z.enum(["soft", "binary", "direct"]).default("soft"),
});

export const generateOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => draftSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { draftAndStoreMessage } = await import("./research.server");
    const res = await draftAndStoreMessage(context.supabase, context.userId, {
      leadId: data.leadId,
      ...(data.campaignId ? { campaignId: data.campaignId } : {}),
      style: data.style,
      ctaStyle: data.ctaStyle,
    });
    return { verification: res.verification, message: res.message };
  });

const sendSchema = z.object({ messageId: z.string().uuid(), override: z.boolean().default(false) });

export const markMessageSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msg, error } = await supabase
      .from("outreach_messages")
      .select("*")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!msg) throw new Error("Message not found.");
    if (!msg.verification_passed && !data.override) {
      throw new Error("Verification failed — review the issues or send with an explicit override.");
    }

    const now = new Date().toISOString();
    await supabase
      .from("outreach_messages")
      .update({ status: "sent", sent_at: now, override_logged: !msg.verification_passed })
      .eq("id", data.messageId);
    await supabase.from("leads").update({ stage: "sent", last_contacted_at: now }).eq("id", msg.lead_id);
    await supabase.from("activities").insert({
      user_id: userId,
      lead_id: msg.lead_id,
      kind: "sent",
      description: msg.verification_passed
        ? "Outreach marked as sent after passing verification."
        : "Outreach marked as sent with a logged verification override.",
      metadata: { message_id: data.messageId, override: !msg.verification_passed },
    });
    return { ok: true };
  });
