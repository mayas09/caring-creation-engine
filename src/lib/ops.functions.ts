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

export const purgeExpiredData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("user_settings")
      .select("data_retention_days")
      .eq("user_id", userId)
      .maybeSingle();
    const days = settings?.data_retention_days ?? 365;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data: acts } = await supabase
      .from("activities")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", cutoff)
      .select("id");
    const { data: chats } = await supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", cutoff)
      .select("id");
    return { retentionDays: days, cutoff, activitiesDeleted: acts?.length ?? 0, chatDeleted: chats?.length ?? 0 };
  });

export const listStaleEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data } = await supabase
      .from("evidence")
      .select("id,evidence_code,claim,checked_at,lead_id,leads(business_name)")
      .eq("user_id", userId)
      .lt("checked_at", cutoff)
      .order("checked_at", { ascending: true })
      .limit(50);
    return (data ?? []).map((e) => ({
      id: e.id as string,
      code: e.evidence_code as string,
      claim: e.claim as string,
      checkedAt: e.checked_at as string,
      leadId: e.lead_id as string | null,
      leadName: ((e as { leads?: { business_name?: string } }).leads?.business_name ?? "Unknown lead") as string,
    }));
  });

export const listEmailDomains = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listMailgunDomains } = await import("./providers.server");
    try {
      return { connected: true, domains: await listMailgunDomains(), error: null as string | null };
    } catch (e) {
      return { connected: false, domains: [], error: e instanceof Error ? e.message : "unavailable" };
    }
  });

/** Actually sends a verified draft through the connected email provider. */
export const sendOutreachEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ messageId: z.string().uuid(), override: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: msg } = await supabase
      .from("outreach_messages")
      .select("*, leads(id,business_name,email,do_not_contact)")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!msg) throw new Error("Message not found.");
    if (msg.status === "sent") throw new Error("This message was already sent.");

    const lead = msg.leads as { id: string; business_name: string; email: string | null; do_not_contact: boolean } | null;
    if (!lead?.email) throw new Error("This lead has no email address on file.");
    if (lead.do_not_contact) throw new Error("This lead is marked do-not-contact.");
    if (!msg.verification_passed && !data.override) {
      throw new Error("Verification has not passed. Re-check the draft or send with a logged override.");
    }

    const { data: settings } = await supabase
      .from("user_settings")
      .select("integrations,daily_email_limit,can_spam_signature")
      .eq("user_id", userId)
      .maybeSingle();
    const integrations = (settings?.integrations ?? {}) as Record<string, string | undefined>;
    const domain = integrations["mailgun_domain"];
    const fromEmail = integrations["from_email"];
    if (!domain || !fromEmail) {
      throw new Error("Set the sending domain and from-address in Settings → Integrations first.");
    }

    const { data: dnc } = await supabase.from("dnc_entries").select("value").eq("user_id", userId);
    const blocked = new Set((dnc ?? []).map((d) => d.value.toLowerCase().trim()));
    const emailLower = lead.email.toLowerCase();
    if (blocked.has(emailLower) || blocked.has(emailLower.split("@")[1] ?? "")) {
      throw new Error("Recipient is on the do-not-contact list.");
    }

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("outreach_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("sent_at", startToday.toISOString());
    const limit = settings?.daily_email_limit ?? 15;
    if ((count ?? 0) >= limit) {
      throw new Error(`Configured daily send limit reached (${count}/${limit}).`);
    }

    const signature = settings?.can_spam_signature ?? "";
    const body = signature ? `${msg.body}\n\n—\n${signature}` : msg.body;
    const fromName = integrations["from_name"];

    // Open tracking is opt-in and always labelled "estimated" in the UI.
    const trackingOn = integrations["open_tracking"] === "on";
    const baseUrl = (integrations["public_base_url"] ?? "").replace(/\/+$/, "");
    const pixelUrl =
      trackingOn && baseUrl && msg.tracking_token
        ? `${baseUrl}/api/public/px/${msg.tracking_token}`
        : null;
    const html = pixelUrl
      ? `<div style="white-space:pre-wrap;font-family:inherit">${body
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</div><img src="${pixelUrl}" width="1" height="1" alt="" style="display:none">`
      : undefined;

    const { sendEmail } = await import("./providers.server");
    let providerId = "";
    try {
      const sent = await sendEmail(
        {
          domain,
          from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          replyTo: integrations["reply_to"] ?? null,
        },
        {
          to: lead.email,
          subject: msg.subject ?? `Quick note for ${lead.business_name}`,
          text: body,
          html,
          tags: ["leadgen-ai-pro"],
        },
      );
      providerId = sent.id;
    } catch (e) {
      const reason = e instanceof Error ? e.message : "send failed";
      await supabase.from("outreach_messages").update({ status: "failed" }).eq("id", data.messageId);
      await supabase.from("activities").insert({
        user_id: userId,
        lead_id: lead.id,
        kind: "send_failed",
        description: `Email send failed: ${reason}`,
        metadata: { message_id: data.messageId },
      });
      throw new Error(reason);
    }

    const sentAt = new Date().toISOString();
    await supabase
      .from("outreach_messages")
      .update({
        status: "sent",
        sent_at: sentAt,
        provider_message_id: providerId.replace(/^<|>$/g, ""),
        override_logged: data.override ? true : msg.override_logged,
        reasoning: { ...(msg.reasoning as Record<string, unknown>), provider: "mailgun", provider_id: providerId },
      })
      .eq("id", data.messageId);

    await supabase
      .from("leads")
      .update({ stage: "sent", last_contacted_at: sentAt })
      .eq("id", lead.id);
    await supabase.from("activities").insert({
      user_id: userId,
      lead_id: lead.id,
      kind: "sent",
      description: data.override
        ? `Email sent to ${lead.email} WITH a logged verification override.`
        : `Email sent to ${lead.email} after verification passed.`,
      metadata: { message_id: data.messageId, provider_id: providerId, domain },
    });

    return { sent: true, providerId, to: lead.email, sentAt };
  });
