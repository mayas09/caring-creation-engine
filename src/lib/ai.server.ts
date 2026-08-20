import type { SupabaseClient } from "@supabase/supabase-js";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export const SELLX_SYSTEM_PROMPT = `You are sell.x, a research partner for a single freelance developer selling custom websites and direct-ordering systems to small businesses.

Non-negotiable rules:
1. Evidence-first. Every factual claim MUST be labeled as one of:
   [Verified] (directly observed on a named source),
   [Calculated] (derived from labeled inputs — show the formula),
   [Inferred] (pattern-based guess — say why and how confident),
   [Unknown] (missing data — say what you'd need to check).
2. Never invent numbers, revenue, commission rates, order volumes, names, or URLs.
   If a number is not supplied, output [Unknown] and state the check needed.
3. Signals, not truths. Prefer "this suggests" over "this proves".
4. Ranges over point estimates when calculating; show assumptions explicitly.
5. Outreach copy must be respectful, specific, short, and free of hype or fake urgency.
6. If asked to fabricate proof, refuse and offer a verification plan instead.

Answer format: short paragraphs or bullets, each fact carrying its label and source.`;

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export async function callSellX(messages: ChatMessage[], leadContext?: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: SELLX_SYSTEM_PROMPT },
      ...(leadContext
        ? [
            {
              role: "system" as const,
              content: `Known lead context (only source of facts you may treat as Verified):\n${leadContext}`,
            },
          ]
        : []),
      ...messages.slice(-20),
    ],
  };

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 429) throw new Error("Rate limit reached. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in settings.");
  if (!res.ok) throw new Error(`AI request failed (${res.status}).`);

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return { content: json.choices?.[0]?.message?.content ?? "" };
}

export async function draftEmailForLead(
  supabase: SupabaseClient,
  userId: string,
  opts: { leadId: string; style: "short" | "medium" | "detailed"; ctaStyle: "soft" | "binary" | "direct" },
) {
  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", opts.leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) throw new Error("Lead not found.");

  const [{ data: signals }, { data: gap }, { data: evidence }] = await Promise.all([
    supabase.from("signals").select("*").eq("lead_id", opts.leadId),
    supabase.from("ordering_gaps").select("*").eq("lead_id", opts.leadId).maybeSingle(),
    supabase.from("evidence").select("*").eq("lead_id", opts.leadId),
  ]);

  const context = JSON.stringify({ lead, signals, orderingGap: gap, evidence }, null, 2);

  const instruction = `Write a cold outreach email to this business.
Length: ${opts.style}. CTA style: ${opts.ctaStyle}.
Rules: reference only labeled evidence from the context; no fabricated metrics; no hype;
subject line under 60 chars; plain, human tone; end with an easy, low-pressure ask.
Return the email as:
SUBJECT: <subject>
BODY:
<body>
EVIDENCE USED: <comma-separated evidence codes or "none">`;

  const result = await callSellX([{ role: "user", content: instruction }], context);
  void userId;
  return result;
}
