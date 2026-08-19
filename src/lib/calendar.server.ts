/**
 * Google Calendar access through the Lovable connector gateway.
 * Used only to CONFIRM a demo from a real calendar event — never to invent one.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

function headers() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const connection = process.env["GOOGLE_CALENDAR_API_KEY"];
  if (!lovable || !connection) throw new Error("Google Calendar is not connected.");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": connection,
    "Content-Type": "application/json",
  };
}

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string;
  start: string | null;
  end: string | null;
  htmlLink: string | null;
  attendees: string[];
  status: string;
};

type RawEvent = {
  id?: string;
  summary?: string;
  description?: string;
  status?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string }>;
};

/** Upcoming events from the connected calendar. Optional free-text query. */
export async function listUpcomingEvents(
  options: { query?: string | undefined; days?: number; calendarId?: string } = {},
): Promise<CalendarEvent[]> {
  const calendarId = options.calendarId ?? "primary";
  const now = new Date();
  const max = new Date(now.getTime() + (options.days ?? 60) * 86_400_000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: max.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  if (options.query) params.set("q", options.query);

  const res = await fetch(
    `${GATEWAY}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { headers: headers() },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Calendar request failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { items?: RawEvent[] };
  return (json.items ?? []).map((e) => ({
    id: e.id ?? "",
    summary: e.summary ?? "(no title)",
    description: e.description ?? "",
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    htmlLink: e.htmlLink ?? null,
    attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
    status: e.status ?? "confirmed",
  }));
}
