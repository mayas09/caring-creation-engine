import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMorningBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { buildBrief } = await import("./ops.server");
    return buildBrief(context.supabase, context.userId);
  });

export const runOpsMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runMaintenance } = await import("./ops.server");
    return runMaintenance(context.supabase, context.userId);
  });

export const runFinalVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ messageId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { finalVerification } = await import("./ops.server");
    return finalVerification(context.supabase, context.userId, data.messageId);
  });

export const queueMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ messageId: z.string().uuid(), scheduledAt: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { finalVerification } = await import("./ops.server");
    const check = await finalVerification(supabase, userId, data.messageId);
    if (!check.passed) {
      return { queued: false, issues: check.issues };
    }
    const { data: settings } = await supabase
      .from("user_settings")
      .select("daily_email_limit")
      .eq("user_id", userId)
      .maybeSingle();
    const limit = settings?.daily_email_limit ?? 15;
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("outreach_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("sent_at", startToday.toISOString());
    if ((count ?? 0) >= limit) {
      return { queued: false, issues: [`Configured daily limit reached (${count}/${limit}).`] };
    }

    const scheduled = data.scheduledAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("outreach_messages")
      .update({ status: "queued", scheduled_at: scheduled })
      .eq("id", data.messageId);
    if (error) throw new Error(error.message);
    await supabase.from("leads").update({ stage: "queued" }).eq(
      "id",
      (await supabase.from("outreach_messages").select("lead_id").eq("id", data.messageId).single()).data!
        .lead_id,
    );
    return { queued: true, issues: [], scheduledAt: scheduled, note: "Recommended send time, not optimal." };
  });

export const generateBump = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ leadId: z.string().uuid(), campaignId: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lead } = await supabase
      .from("leads")
      .select("bump_count")
      .eq("id", data.leadId)
      .maybeSingle();
    const { data: settings } = await supabase
      .from("user_settings")
      .select("aggressiveness,email_style,cta_style")
      .eq("user_id", userId)
      .maybeSingle();
    const maxBumps =
      settings?.aggressiveness === "aggressive" ? 3 : settings?.aggressiveness === "direct" ? 3 : settings?.aggressiveness === "gentle" ? 1 : 2;
    const current = lead?.bump_count ?? 0;
    if (current >= maxBumps) {
      return { drafted: false, reason: `Bump limit reached (${current}/${maxBumps}) for this aggressiveness setting.` };
    }

    const { draftAndStoreMessage } = await import("./research.server");
    const res = await draftAndStoreMessage(supabase, userId, {
      leadId: data.leadId,
      ...(data.campaignId ? { campaignId: data.campaignId } : {}),
      style: settings?.email_style ?? "short",
      ctaStyle: settings?.cta_style ?? "soft",
    });
    await supabase
      .from("outreach_messages")
      .update({ is_bump: true, step_index: current + 1 })
      .eq("id", (res.message as { id: string }).id);
    await supabase.from("leads").update({ bump_count: current + 1 }).eq("id", data.leadId);
    return { drafted: true, verification: res.verification, message: res.message };
  });
