import type { SupabaseClient } from "@supabase/supabase-js";
import { SELLX_SYSTEM_PROMPT } from "./ai.server";
import { structuredCall } from "./research.server";

export const IDENTITY_DISCLOSURE =
  "I'm an AI assistant calling on behalf of Mayas Allali, a developer who builds ordering sites for small businesses.";

type ScriptResult = {
  opening: string;
  discovery_questions: string[];
  value_proposition: string;
  objection_handling: Array<{ objection: string; response: string }>;
  cta: string;
  voicemail: string;
  evidence_used: string[];
  do_not_say: string[];
};

const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "opening",
    "discovery_questions",
    "value_proposition",
    "objection_handling",
    "cta",
    "voicemail",
    "evidence_used",
    "do_not_say",
  ],
  properties: {
    opening: { type: "string" },
    discovery_questions: { type: "array", items: { type: "string" } },
    value_proposition: { type: "string" },
    objection_handling: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["objection", "response"],
        properties: { objection: { type: "string" }, response: { type: "string" } },
      },
    },
    cta: { type: "string" },
    voicemail: { type: "string" },
    evidence_used: { type: "array", items: { type: "string" } },
    do_not_say: { type: "array", items: { type: "string" } },
  },
} as const;

function renderScript(lead: { business_name: string }, r: ScriptResult, accent: string) {
  return [
    `SCRIPT FOR: ${lead.business_name}   (accent: ${accent})`,
    "",
    `OPENING\n${r.opening}`,
    "",
    `DISCOVERY (questions, not assumptions)\n${r.discovery_questions.map((q) => `• ${q}`).join("\n")}`,
    "",
    `VALUE\n${r.value_proposition}`,
    "",
    `OBJECTIONS\n${r.objection_handling.map((o) => `• "${o.objection}" → ${o.response}`).join("\n")}`,
    "",
    `CTA (binary)\n${r.cta}`,
    "",
    `VOICEMAIL (< 20s)\n${r.voicemail}`,
    "",
    `IF ASKED "is this AI?" → ${IDENTITY_DISCLOSURE}`,
    `IF ASKED SOMETHING UNKNOWN → "I'd need to check that and get back to you."`,
    "",
    `EVIDENCE CHECK\n${r.evidence_used.map((e) => `✅ ${e}`).join("\n") || "⚪ No verified evidence on file."}`,
    `NEVER SAY\n${r.do_not_say.map((d) => `❌ ${d}`).join("\n")}`,
  ].join("\n");
}

export async function buildCallScript(supabase: SupabaseClient, userId: string, leadId: string) {
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) throw new Error("Lead not found.");
  if (lead.do_not_contact) throw new Error("This lead is marked do-not-contact.");

  const { data: evidence } = await supabase
    .from("evidence")
    .select("evidence_code,claim,type,source,confidence")
    .eq("lead_id", leadId);
  const { data: settings } = await supabase
    .from("user_settings")
    .select("voice_accent,voice_gender,call_recording_default")
    .eq("user_id", userId)
    .maybeSingle();

  const verified = (evidence ?? []).filter((e) => e.type === "verified" || e.type === "calculated");
  const unknown = (evidence ?? []).filter((e) => e.type === "unknown");

  const result = await structuredCall<ScriptResult>({
    system: SELLX_SYSTEM_PROMPT,
    user: `Write a cold-call script for ${lead.business_name}.

VERIFIED / CALCULATED EVIDENCE (only these may be stated as fact):
${verified.map((e) => `- [${e.evidence_code}] ${e.claim} (source: ${e.source ?? "n/a"})`).join("\n") || "- none"}

UNKNOWN (never state, never estimate):
${unknown.map((e) => `- [${e.evidence_code}] ${e.claim}`).join("\n") || "- revenue, order volume, commission rates"}

Rules: no revenue estimates, no commission percentages, no invented stats, no loss-aversion numbers.
Discovery must be questions. CTA must be a binary choice. Voicemail under 20 seconds.
do_not_say must list the specific numbers/claims that are unknown for this lead.`,
    schemaName: "call_script",
    schema: SCRIPT_SCHEMA as unknown as Record<string, unknown>,
  });

  const accent = settings?.voice_accent ?? "american";
  const text = renderScript(lead, result, accent);

  const { data: call, error } = await supabase
    .from("calls")
    .insert({
      user_id: userId,
      lead_id: leadId,
      script: text,
      accent,
      recording_enabled: settings?.call_recording_default ?? false,
      result: "planned",
      evidence_codes: verified.map((e) => e.evidence_code),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("activities").insert({
    user_id: userId,
    lead_id: leadId,
    kind: "call_script",
    description: `Call script generated from ${verified.length} verified claims.`,
    metadata: { call_id: call.id },
  });

  return { script: text, callId: call.id, structured: result };
}

type CallSummary = {
  verified: string[];
  stated_by_lead: string[];
  unknown: string[];
  next_action: string;
  result: "interested" | "not_interested" | "callback" | "voicemail" | "no_answer";
};

export async function summarizeCall(
  supabase: SupabaseClient,
  userId: string,
  input: { callId: string; transcript: string; durationSeconds: number },
) {
  const result = await structuredCall<CallSummary>({
    system: SELLX_SYSTEM_PROMPT,
    user: `Summarize this call transcript. Separate three buckets strictly:
- verified: facts confirmed by observable evidence or clearly confirmed on the call
- stated_by_lead: things the lead said that are NOT verified (label them as their statement)
- unknown: anything still not known — never estimate it

TRANSCRIPT:
${input.transcript.slice(0, 12000)}`,
    schemaName: "call_summary",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["verified", "stated_by_lead", "unknown", "next_action", "result"],
      properties: {
        verified: { type: "array", items: { type: "string" } },
        stated_by_lead: { type: "array", items: { type: "string" } },
        unknown: { type: "array", items: { type: "string" } },
        next_action: { type: "string" },
        result: {
          type: "string",
          enum: ["interested", "not_interested", "callback", "voicemail", "no_answer"],
        },
      },
    },
  });

  const { data: call, error } = await supabase
    .from("calls")
    .update({
      transcript: input.transcript,
      duration_seconds: input.durationSeconds,
      result: result.result,
      summary: result as unknown as Record<string, unknown>,
    })
    .eq("id", input.callId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("activities").insert({
    user_id: userId,
    lead_id: call.lead_id,
    kind: "call",
    description: `Call logged (${result.result}). Next: ${result.next_action}`,
    metadata: { call_id: input.callId },
  });

  return result;
}
