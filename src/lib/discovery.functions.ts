import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const discoverySchema = z.object({
  industry: z.string().min(2),
  location: z.string().min(2),
  filters: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(10).default(5),
  notes: z.string().max(500).optional(),
});

export const discoverLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => discoverySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { runDiscovery } = await import("./discovery.server");
    return runDiscovery(context.supabase, context.userId, data);
  });

const leadSchema = z.object({ leadId: z.string().uuid() });

export const qualifyLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => leadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { negativeQualify } = await import("./discovery.server");
    return negativeQualify(context.supabase, context.userId, data.leadId);
  });

const decisionSchema = z.object({
  leadId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.enum(["location", "industry", "signal_quality", "other", ""]).default(""),
  note: z.string().max(500).optional(),
});

export const decideLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const approved = data.decision === "approved";
    const { error } = await supabase
      .from("leads")
      .update({
        approval_status: data.decision,
        approved_at: approved ? new Date().toISOString() : null,
        stage: approved ? "reviewed" : "closed_lost",
        rejection_reason: approved ? null : [data.reason, data.note].filter(Boolean).join(" — ") || null,
        do_not_contact: approved ? false : true,
      })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    await supabase.from("activities").insert({
      user_id: userId,
      lead_id: data.leadId,
      kind: approved ? "approved" : "rejected",
      description: approved
        ? "User approved this lead for contact drafting."
        : `User rejected this lead — reason: ${data.reason || "unspecified"}${data.note ? ` (${data.note})` : ""}`,
      metadata: { reason: data.reason, note: data.note ?? null },
    });
    return { ok: true };
  });

const dncSchema = z.object({
  value: z.string().min(2).max(200),
  kind: z.enum(["email", "phone", "domain", "business"]).default("email"),
  reason: z.string().max(300).optional(),
});

export const addDncEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => dncSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("dnc_entries").upsert(
      {
        user_id: context.userId,
        value: data.value.trim(),
        kind: data.kind,
        reason: data.reason ?? null,
      },
      { onConflict: "user_id,value" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
