import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const leadSchema = z.object({ leadId: z.string().uuid() });

export const enrichLeadFromMaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => leadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { enrichFromGoogleMaps } = await import("./integrations.server");
    const res = await enrichFromGoogleMaps(context.supabase, context.userId, data.leadId);
    return { matched: res.matched, claims: res.claims, message: res.message };
  });

export const confirmDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => leadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { confirmDemoFromCalendar } = await import("./integrations.server");
    const res = await confirmDemoFromCalendar(context.supabase, context.userId, data.leadId);
    return { confirmed: res.confirmed, message: res.message };
  });

export const listCalendarDemos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listUpcomingEvents } = await import("./calendar.server");
    const events = await listUpcomingEvents({ days: 45 });
    return events.map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start,
      link: e.htmlLink,
      attendees: e.attendees,
    }));
  });

export const searchPlacesForDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ query: z.string().min(2).max(200), limit: z.number().int().min(1).max(20).default(10) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { searchPlaces } = await import("./places.server");
    return searchPlaces(data.query, data.limit);
  });
