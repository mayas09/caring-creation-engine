import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateCallScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ leadId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { buildCallScript } = await import("./voice.server");
    return buildCallScript(context.supabase, context.userId, data.leadId);
  });

export const logCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        callId: z.string().uuid(),
        transcript: z.string().min(10),
        durationSeconds: z.number().int().min(0).default(0),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { summarizeCall } = await import("./voice.server");
    return summarizeCall(context.supabase, context.userId, data);
  });
