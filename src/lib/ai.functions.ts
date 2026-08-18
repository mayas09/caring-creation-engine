import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callSellX } from "./ai.server";

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
  .handler(async ({ data }) => callSellX(data.messages, data.leadContext));

const draftSchema = z.object({
  leadId: z.string().uuid(),
  style: z.enum(["short", "medium", "detailed"]).default("short"),
  ctaStyle: z.enum(["soft", "binary", "direct"]).default("soft"),
});

export const draftOutreachEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => draftSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { draftEmailForLead } = await import("./ai.server");
    return draftEmailForLead(context.supabase, context.userId, data);
  });
