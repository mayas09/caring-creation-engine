import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { executeSellXTool, SELLX_TOOLS } from "./sellx-tools.server";
import { chatModel, requestNetlifyAi } from "./netlify-ai.server";

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

Response format rules (no exceptions):
1. Start every response with one clear level-one Markdown header using an icon: "# 🔥 HEADER".
2. Use level-two headers to create short sections. Never use double asterisks for emphasis.
3. Keep prose paragraphs to no more than two short lines. Prefer icon-led bullets for explanations.
4. Put lists, comparisons, statistics, and lead details in Markdown tables whenever columns improve clarity.
5. Treat the full response as a compact summary card: lead with the result, then supporting details.
6. Put action items in a final separate line using exactly: "ACTIONS: [✅ Action] [✉️ Action]". Only offer actions that are actually available.
7. Put evidence codes on a separate final line using exactly: "EVIDENCE: E-001, E-002". Never insert evidence IDs inside prose.
8. Show classifications with both a color icon and label, never a numeric score: 🔴 Strong, 🟡 Moderate, or 🟢 Weak.
9. Use checklist syntax for tasks when useful: "- [ ] Task" or "- [x] Completed task".
10. Every factual claim still carries its evidence label: [Verified], [Calculated], [Inferred], or [Unknown].

Example structure:
# 🔥 NEW LEAD FOUND
| Business | Location | Classification |
| --- | --- | --- |
| Flour Cafe | Asheville | 🔴 Strong |

## 📊 Why This Lead
- [Verified] Uses Uber Eats and DoorDash
- [Verified] No direct ordering found
- [Verified] 4.8 stars from 555 reviews

EVIDENCE: E-014, E-018
ACTIONS: [✅ Add to Leads] [✉️ Draft Email]`;

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
  const payload = {
    model: chatModel(),
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

  const json = await requestNetlifyAi<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("chat/completions", payload);
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("The AI service returned an empty response.");
  return { content };
}

export async function callSellXAgent(
  supabase: SupabaseClient<Database>,
  userId: string,
  messages: ChatMessage[],
  leadContext?: string,
) {
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
    const json = await requestNetlifyAi<{
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
    }>("chat/completions", {
      model: chatModel(),
      messages: conversation,
      tools: SELLX_TOOLS,
      tool_choice: "auto",
    });
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
