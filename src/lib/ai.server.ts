import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { executeSellXTool, SELLX_TOOLS } from "./sellx-tools.server";

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
7. When the user asks for an available action, call the matching tool and report the actual result. Never claim an action happened without a successful tool result.
8. Email safety is absolute: you may draft, edit, delete, verify, schedule, and queue email, but never send it. Queued email still requires user approval.
9. Settings changes require two steps: request confirmation first, then apply only after the user explicitly confirms.

Answer format: short paragraphs or bullets, each fact carrying its label and source.`;

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type AgentMessage =
  | ChatMessage
  | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

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

export async function callSellXAgent(
  supabase: SupabaseClient<Database>,
  userId: string,
  messages: ChatMessage[],
  leadContext?: string,
) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");

  const conversation: AgentMessage[] = [
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
  ];
  let clearedMemory = false;

  for (let round = 0; round < 8; round += 1) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: conversation,
        tools: SELLX_TOOLS,
        tool_choice: "auto",
      }),
    });

    if (res.status === 429) throw new Error("Rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in settings.");
    if (!res.ok) throw new Error(`AI request failed (${res.status}).`);

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
    };
    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("AI returned an empty response.");
    if (!message.tool_calls?.length) {
      return { content: message.content ?? "Action completed.", clearedMemory };
    }

    conversation.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    });
    for (const toolCall of message.tool_calls) {
      let toolArguments: unknown = {};
      try {
        toolArguments = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        toolArguments = {};
      }
      const result = await executeSellXTool(
        { supabase, userId },
        toolCall.function.name,
        toolArguments,
      );
      if (toolCall.function.name === "clear_chat_memory" && result.ok) clearedMemory = true;
      conversation.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error("sell.x reached the action limit for one request. Try a smaller request.");
}

export async function draftEmailForLead(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    leadId: string;
    style: "short" | "medium" | "detailed";
    ctaStyle: "soft" | "binary" | "direct";
  },
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
