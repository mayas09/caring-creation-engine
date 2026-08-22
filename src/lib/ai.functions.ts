import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callSellXAgent } from "./ai.server";
import { safeAiReply } from "./netlify-ai.server";

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .min(1),
  leadContext: z.string().optional(),
});

export const sellxChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => chatSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      return await callSellXAgent(
        context.supabase,
        context.userId,
        data.messages,
        data.leadContext,
      );
    } catch (error) {
      return { content: safeAiReply(error), clearedMemory: false };
    }
  });
