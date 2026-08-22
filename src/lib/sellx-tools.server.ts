import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { db } from "../../db/index.js";
import {
  assistantActionLog,
  assistantAutomationState,
  assistantConfirmation,
  conversationMemory,
} from "../../db/schema.js";
import type { Database } from "@/integrations/supabase/types";

const LEAD_STAGES = [
  "new",
  "reviewed",
  "contact_drafted",
  "queued",
  "sent",
  "replied",
  "demo_scheduled",
  "proposal_sent",
  "negotiating",
  "closed_won",
  "closed_lost",
  "ghost",
] as const;

const SETTINGS_SCHEMA = z
  .object({
    assistant_name: z.string().min(1).max(80).optional(),
    default_industry: z.string().min(1).max(120).optional(),
    aggressiveness: z.enum(["gentle", "balanced", "direct", "aggressive"]).optional(),
    email_style: z.enum(["short", "medium", "detailed"]).optional(),
    cta_style: z.enum(["soft", "binary", "direct"]).optional(),
    daily_email_limit: z.number().int().min(1).max(500).optional(),
    ghost_threshold_days: z.number().int().min(1).max(365).optional(),
    can_spam_signature: z.string().max(1000).optional(),
    gdpr_tracking: z.boolean().optional(),
    call_recording_default: z.boolean().optional(),
    data_retention_days: z.number().int().min(30).max(3650).optional(),
    voice_provider: z.enum(["none", "manual", "elevenlabs", "twilio"]).optional(),
    voice_gender: z.enum(["neutral", "female", "male"]).optional(),
    voice_accent: z.enum(["neutral", "american", "british", "australian"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one setting is required.");

type AppSupabase = SupabaseClient<Database>;
type ToolContext = { supabase: AppSupabase; userId: string };
type ToolResult = { ok: boolean; message: string; data?: unknown };

export const SELLX_TOOLS = [
  tool(
    "add_lead",
    "Add a business to the user's leads.",
    {
      business_name: stringProp("Business name"),
      city: stringProp("City"),
      industry: stringProp("Industry"),
      website: stringProp("Website URL"),
      email: stringProp("Email address"),
      phone: stringProp("Phone number"),
      notes: stringProp("Notes"),
    },
    ["business_name"],
  ),
  tool(
    "delete_lead",
    "Permanently delete a lead owned by the user.",
    {
      lead: stringProp("Lead UUID or exact business name"),
    },
    ["lead"],
  ),
  tool(
    "edit_lead",
    "Update editable information for a lead.",
    {
      lead: stringProp("Lead UUID or exact business name"),
      business_name: stringProp("New business name"),
      contact_name: stringProp("Contact name"),
      city: stringProp("City"),
      country: stringProp("Country"),
      industry: stringProp("Industry"),
      website: stringProp("Website URL"),
      email: stringProp("Email address"),
      phone: stringProp("Phone number"),
      address: stringProp("Address"),
      notes: stringProp("Notes"),
    },
    ["lead"],
  ),
  tool(
    "draft_email",
    "Create and store an evidence-checked email draft for a lead.",
    {
      lead: stringProp("Lead UUID or exact business name"),
      style: enumProp(["short", "medium", "detailed"]),
      cta_style: enumProp(["soft", "binary", "direct"]),
    },
    ["lead"],
  ),
  tool(
    "queue_email",
    "Verify and queue an email draft for user approval. Never sends it.",
    {
      draft: stringProp("Draft UUID or lead business name"),
      scheduled_at: stringProp("Optional ISO date-time"),
    },
    ["draft"],
  ),
  tool(
    "edit_email_draft",
    "Edit a stored email draft, then rerun verification.",
    {
      draft: stringProp("Draft UUID or lead business name"),
      subject: stringProp("Replacement subject"),
      body: stringProp("Replacement body"),
    },
    ["draft"],
  ),
  tool(
    "delete_email_draft",
    "Delete an unsent email draft.",
    {
      draft: stringProp("Draft UUID or lead business name"),
    },
    ["draft"],
  ),
  tool(
    "change_lead_status",
    "Move a lead to a pipeline status.",
    {
      lead: stringProp("Lead UUID or exact business name"),
      status: enumProp([...LEAD_STAGES]),
    },
    ["lead", "status"],
  ),
  tool(
    "schedule_follow_up",
    "Schedule an existing draft as a follow-up without sending it.",
    {
      lead: stringProp("Lead UUID or exact business name"),
      scheduled_at: stringProp("ISO date-time for the follow-up"),
    },
    ["lead", "scheduled_at"],
  ),
  tool(
    "discovery_search",
    "Run a real discovery search and add qualified candidates.",
    {
      industry: stringProp("Business type, such as bakeries"),
      location: stringProp("City or region"),
      limit: { type: "integer", minimum: 1, maximum: 10 },
      filters: { type: "array", items: { type: "string" } },
      sources: { type: "array", items: { type: "string" } },
    },
    ["industry", "location"],
  ),
  tool(
    "run_verification",
    "Recheck stored evidence for a lead.",
    {
      lead: stringProp("Lead UUID or exact business name"),
    },
    ["lead"],
  ),
  tool("export_leads", "Export the user's leads to CSV.", {
    status: enumProp([...LEAD_STAGES]),
  }),
  tool(
    "request_settings_change",
    "Create a confirmation request before changing settings.",
    {
      changes: { type: "object", additionalProperties: true },
    },
    ["changes"],
  ),
  tool(
    "confirm_settings_change",
    "Apply a previously requested settings change after explicit confirmation.",
    {
      confirmation_id: stringProp("Confirmation UUID shown to the user"),
    },
    ["confirmation_id"],
  ),
  tool("clear_chat_memory", "Delete the user's stored sell.x chat and conversation memory.", {}),
  tool(
    "pause_automation",
    "Pause or resume campaigns and automated follow-ups.",
    {
      paused: { type: "boolean" },
      reason: stringProp("Optional reason"),
    },
    ["paused"],
  ),
] as const;

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
) {
  return {
    type: "function" as const,
    function: {
      name,
      description,
      parameters: { type: "object", additionalProperties: false, properties, required },
    },
  };
}

function stringProp(description: string) {
  return { type: "string", description };
}

function enumProp(values: string[]) {
  return { type: "string", enum: values };
}

function isUuid(value: string) {
  return z.string().uuid().safeParse(value).success;
}

async function resolveLead(supabase: AppSupabase, userId: string, reference: string) {
  let query = supabase.from("leads").select("*").eq("user_id", userId);
  query = isUuid(reference) ? query.eq("id", reference) : query.ilike("business_name", reference.trim());
  const { data, error } = await query.limit(2);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(`Lead not found: ${reference}`);
  if (data.length > 1) throw new Error(`More than one lead matches ${reference}. Use the lead ID.`);
  return data[0]!;
}

async function resolveDraft(supabase: AppSupabase, userId: string, reference: string) {
  if (isUuid(reference)) {
    const { data, error } = await supabase
      .from("outreach_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("id", reference)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Draft not found.");
    return data;
  }
  const lead = await resolveLead(supabase, userId, reference);
  const { data, error } = await supabase
    .from("outreach_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("lead_id", lead.id)
    .neq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No unsent draft found for ${lead.business_name}.`);
  return data;
}

async function logAction(supabase: AppSupabase, userId: string, action: string, result: ToolResult, target?: string) {
  try {
    await supabase.from("assistant_action_log").insert({
      user_id: userId,
      action,
      target: target ?? null,
      status: result.ok ? "completed" : "failed",
      detail: { message: result.message },
      created_at: new Date(),
    });
  } catch (error) {
    console.error(
      "Unable to write sell.x action log",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

export async function executeSellXTool(
  context: ToolContext,
  name: string,
  rawArguments: unknown,
): Promise<ToolResult> {
  try {
    const result = await execute(context, name, rawArguments);
    await logAction(context.supabase, context.userId, name, result, getTarget(rawArguments));
    return result;
  } catch (error) {
    const result = {
      ok: false,
      message: error instanceof Error ? error.message : "Action failed.",
    };
    await logAction(context.supabase, context.userId, name, result, getTarget(rawArguments));
    return result;
  }
}

async function execute(
  { supabase, userId }: ToolContext,
  name: string,
  rawArguments: unknown,
): Promise<ToolResult> {
  const args = z.record(z.string(), z.unknown()).parse(rawArguments);

  if (name === "add_lead") {
    const data = z
      .object({
        business_name: z.string().min(1),
        city: z.string().optional(),
        industry: z.string().optional(),
        website: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(args);
    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        user_id: userId,
        business_name: data.business_name,
        city: data.city ?? null,
        industry: data.industry ?? null,
        website: data.website ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        notes: data.notes ?? null,
        source: "sell.x chat",
      })
      .select("id,business_name")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, message: `Added ${lead.business_name} to leads.`, data: lead };
  }

  if (name === "delete_lead") {
    const { lead: reference } = z.object({ lead: z.string() }).parse(args);
    const lead = await resolveLead(supabase, userId, reference);
    const { error } = await supabase.from("leads").delete().eq("user_id", userId).eq("id", lead.id);
    if (error) throw new Error(error.message);
    return { ok: true, message: `Deleted ${lead.business_name}.` };
  }

  if (name === "edit_lead") {
    const data = z
      .object({
        lead: z.string(),
        business_name: z.string().optional(),
        contact_name: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        industry: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(args);
    const lead = await resolveLead(supabase, userId, data.lead);
    const changes = compactObject({
      business_name: data.business_name,
      contact_name: data.contact_name,
      city: data.city,
      country: data.country,
      industry: data.industry,
      website: data.website,
      email: data.email,
      phone: data.phone,
      address: data.address,
      notes: data.notes,
    }) as Database["public"]["Tables"]["leads"]["Update"];
    if (!Object.keys(changes).length) throw new Error("No lead changes were provided.");
    const { error } = await supabase
      .from("leads")
      .update(changes)
      .eq("user_id", userId)
      .eq("id", lead.id);
    if (error) throw new Error(error.message);
    return { ok: true, message: `Updated ${lead.business_name}.`, data: changes };
  }

  if (name === "draft_email") {
    const data = z
      .object({
        lead: z.string(),
        style: z.enum(["short", "medium", "detailed"]).default("short"),
        cta_style: z.enum(["soft", "binary", "direct"]).default("soft"),
      })
      .parse(args);
    const lead = await resolveLead(supabase, userId, data.lead);
    const { draftAndStoreMessage } = await import("./research.server");
    const draft = await draftAndStoreMessage(supabase, userId, {
      leadId: lead.id,
      style: data.style,
      ctaStyle: data.cta_style,
    });
    return {
      ok: true,
      message: `Drafted an email for ${lead.business_name}. It has not been sent.`,
      data: {
        messageId: draft.message.id,
        subject: draft.message.subject,
        body: draft.message.body,
        verification: draft.verification,
      },
    };
  }

  if (name === "queue_email") {
    const data = z
      .object({ draft: z.string(), scheduled_at: z.string().datetime().optional() })
      .parse(args);
    const draft = await resolveDraft(supabase, userId, data.draft);
    const { finalVerification } = await import("./ops.server");
    const check = await finalVerification(supabase, userId, draft.id);
    if (!check.passed)
      return {
        ok: false,
        message: `Draft was not queued because verification failed: ${check.issues.join("; ")}`,
        data: check,
      };
    const scheduledAt = data.scheduled_at ?? new Date(Date.now() + 3_600_000).toISOString();
    const { error } = await supabase
      .from("outreach_messages")
      .update({ status: "queued", scheduled_at: scheduledAt })
      .eq("user_id", userId)
      .eq("id", draft.id);
    if (error) throw new Error(error.message);
    await supabase.from("leads").update({ stage: "queued" }).eq("user_id", userId).eq("id", draft.lead_id);
    return {
      ok: true,
      message: `Queued the draft for ${scheduledAt}. User approval is still required before sending.`,
      data: { messageId: draft.id, scheduledAt },
    };
  }

  if (name === "edit_email_draft") {
    const data = z
      .object({ draft: z.string(), subject: z.string().optional(), body: z.string().optional() })
      .refine(
        (value) => value.subject !== undefined || value.body !== undefined,
        "Provide a subject or body.",
      )
      .parse(args);
    const draft = await resolveDraft(supabase, userId, data.draft);
    if (draft.status === "sent") throw new Error("Sent messages cannot be edited.");
    const changes = {
      ...(data.subject !== undefined ? { subject: data.subject } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      status: "draft" as const,
    };
    const { error } = await supabase
      .from("outreach_messages")
      .update(changes)
      .eq("user_id", userId)
      .eq("id", draft.id);
    if (error) throw new Error(error.message);
    const { finalVerification } = await import("./ops.server");
    const verification = await finalVerification(supabase, userId, draft.id);
    return {
      ok: true,
      message: `Updated the email draft. Verification ${verification.passed ? "passed" : "needs review"}.`,
      data: { messageId: draft.id, verification },
    };
  }

  if (name === "delete_email_draft") {
    const data = z.object({ draft: z.string() }).parse(args);
    const draft = await resolveDraft(supabase, userId, data.draft);
    if (draft.status === "sent") throw new Error("Sent messages cannot be deleted as drafts.");
    const { error } = await supabase.from("outreach_messages").delete().eq("user_id", userId).eq("id", draft.id);
    if (error) throw new Error(error.message);
    return { ok: true, message: "Deleted the email draft." };
  }

  if (name === "change_lead_status") {
    const data = z.object({ lead: z.string(), status: z.enum(LEAD_STAGES) }).parse(args);
    const lead = await resolveLead(supabase, userId, data.lead);
    const { error } = await supabase.from("leads").update({ stage: data.status }).eq("user_id", userId).eq("id", lead.id);
    if (error) throw new Error(error.message);
    return { ok: true, message: `Moved ${lead.business_name} to ${data.status}.` };
  }

  if (name === "schedule_follow_up") {
    const data = z.object({ lead: z.string(), scheduled_at: z.string().datetime() }).parse(args);
    const lead = await resolveLead(supabase, userId, data.lead);
    const draft = await resolveDraft(supabase, userId, lead.business_name);
    const { error } = await supabase
      .from("outreach_messages")
      .update({ status: "queued", scheduled_at: data.scheduled_at })
      .eq("user_id", userId)
      .eq("id", draft.id);
    if (error) throw new Error(error.message);
    return {
      ok: true,
      message: `Scheduled the follow-up for ${lead.business_name} at ${data.scheduled_at}. It remains queued for approval.`,
    };
  }

  if (name === "discovery_search") {
    const data = z
      .object({
        industry: z.string().min(2),
        location: z.string().min(2),
        limit: z.number().int().min(1).max(10).default(5),
        filters: z.array(z.string()).default([]),
        sources: z.array(z.string()).default([]),
      })
      .parse(args);
    const { runDiscovery } = await import("./discovery.server");
    const result = await runDiscovery(supabase, userId, data);
    return {
      ok: true,
      message: `Completed discovery for ${data.industry} in ${data.location}.`,
      data: result,
    };
  }

  if (name === "run_verification") {
    const data = z.object({ lead: z.string() }).parse(args);
    const lead = await resolveLead(supabase, userId, data.lead);
    const { auditLead } = await import("./research.server");
    const result = await auditLead(supabase, userId, lead.id);
    return { ok: true, message: `Rechecked data for ${lead.business_name}.`, data: result };
  }

  if (name === "export_leads") {
    const data = z.object({ status: z.enum(LEAD_STAGES).optional() }).parse(args);
    let query = supabase
      .from("leads")
      .select(
        "business_name,contact_name,email,phone,website,city,country,industry,stage,priority,notes",
      )
      .eq("user_id", userId)
      .order("business_name");
    if (data.status) query = query.eq("stage", data.status);
    const { data: leads, error } = await query.limit(1000);
    if (error) throw new Error(error.message);
    const headers = [
      "business_name",
      "contact_name",
      "email",
      "phone",
      "website",
      "city",
      "country",
      "industry",
      "stage",
      "priority",
      "notes",
    ] as const;
    const csv = [
      headers.join(","),
      ...(leads ?? []).map((lead) => headers.map((header) => csvCell(lead[header])).join(",")),
    ].join("\n");
    return {
      ok: true,
      message: `Exported ${leads?.length ?? 0} leads to CSV.`,
      data: { filename: `sellx-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv },
    };
  }

  if (name === "request_settings_change") {
    const { changes } = z.object({ changes: SETTINGS_SCHEMA }).parse(args);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const { data: inserted, error } = await supabase
      .from("assistant_confirmation")
      .insert({ user_id: userId, action: "change_settings", payload: changes, expires_at: expiresAt })
      .select("id,expires_at");
    if (error) throw new Error(error.message);
    const confirmation = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!confirmation) throw new Error("Unable to create a settings confirmation.");
    return {
      ok: true,
      message: `Confirmation required. Ask the user to confirm changes ${JSON.stringify(changes)}. Confirmation ID: ${confirmation.id}. It expires at ${confirmation.expires_at}.`,
      data: confirmation,
    };
  }

  if (name === "confirm_settings_change") {
    const { confirmation_id } = z.object({ confirmation_id: z.string().uuid() }).parse(args);
    const { data: confirmation, error: fetchErr } = await supabase
      .from("assistant_confirmation")
      .select("*")
      .eq("id", confirmation_id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!confirmation) throw new Error("Pending confirmation not found.");
    if (new Date(confirmation.expires_at).getTime() < Date.now()) {
      await supabase.from("assistant_confirmation").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", confirmation.id);
      throw new Error("That confirmation expired. Request the settings change again.");
    }
    const changes = compactObject(SETTINGS_SCHEMA.parse(confirmation.payload)) as Database["public"]["Tables"]["user_settings"]["Update"];
    const { error: upsertErr } = await supabase.from("user_settings").upsert({ user_id: userId, ...changes }, { onConflict: "user_id" });
    if (upsertErr) throw new Error(upsertErr.message);
    await supabase.from("assistant_confirmation").update({ status: "confirmed", resolved_at: new Date().toISOString() }).eq("id", confirmation.id);
    return { ok: true, message: "Applied the confirmed settings change.", data: changes };
  }

  if (name === "clear_chat_memory") {
    await supabase.from("conversation_memory").delete().eq("user_id", userId);
    const { error } = await supabase.from("chat_messages").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, message: "Cleared stored chat and conversation memory." };
  }

  if (name === "pause_automation") {
    const data = z.object({ paused: z.boolean(), reason: z.string().max(500).optional() }).parse(args);
    // Use upsert to emulate onConflictDoUpdate from drizzle
    const upsertPayload = {
      user_id: userId,
      paused: data.paused,
      reason: data.reason ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error: upsertErr } = await supabase.from("assistant_automation_state").upsert([upsertPayload], { onConflict: "user_id" });
    if (upsertErr) throw new Error(upsertErr.message);
    const { error } = await supabase.from("campaigns").update({ is_active: !data.paused }).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return {
      ok: true,
      message: data.paused
        ? "Paused all campaigns and automated follow-ups."
        : "Resumed campaigns and automated follow-ups.",
    };
  }

  throw new Error(`Unknown sell.x action: ${name}`);
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined));
}

function getTarget(rawArguments: unknown) {
  if (!rawArguments || typeof rawArguments !== "object") return undefined;
  const args = rawArguments as Record<string, unknown>;
  const target = args["lead"] ?? args["draft"] ?? args["business_name"] ?? args["confirmation_id"];
  return typeof target === "string" ? target : undefined;
}
