import type { SupabaseClient } from "@supabase/supabase-js";

function pad(n: number) {
  return String(n).padStart(3, "0");
}

/** Allocates the next free EV-YYYY-MMDD-NNN codes for a user, without reusing existing ones. */
export async function nextEvidenceCodes(
  supabase: SupabaseClient,
  userId: string,
  count: number,
  now = new Date(),
): Promise<string[]> {
  const y = now.getUTCFullYear();
  const md = `${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const prefix = `EV-${y}-${md}-`;
  const { data } = await supabase
    .from("evidence")
    .select("evidence_code")
    .eq("user_id", userId)
    .like("evidence_code", `${prefix}%`);
  let max = 0;
  for (const row of data ?? []) {
    const n = Number.parseInt(String(row.evidence_code).slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${pad(max + i + 1)}`);
}

/**
 * Enriches a lead with data from the official Google Places API.
 * Every stored claim is Verified with the Google Maps URL as its source; anything
 * Google does not return stays Unknown.
 */
export async function enrichFromGoogleMaps(
  supabase: SupabaseClient,
  userId: string,
  leadId: string,
) {
  const { data: lead } = await supabase
    .from("leads")
    .select("id,business_name,city,country,website,phone,disqualifier_reason")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) throw new Error("Lead not found.");

  const { searchPlaces } = await import("./places.server");
  const query = [lead.business_name, lead.city, lead.country].filter(Boolean).join(", ");
  const results = await searchPlaces(query, 5);
  const wanted = String(lead.business_name).toLowerCase();
  const place =
    results.find((r) => r.name.toLowerCase().includes(wanted) || wanted.includes(r.name.toLowerCase())) ??
    results[0];

  if (!place) {
    return { matched: false as const, claims: 0, message: "No Google Business Profile found for this name and location." };
  }

  const source = place.mapsUri ?? "https://maps.google.com";
  const now = new Date();
  const claims: Array<{ claim: string; type: "verified" | "unknown"; confidence: "high" | "medium" | "none" }> = [
    {
      claim: `Google Business Profile found: ${place.name} — ${place.address}`,
      type: "verified",
      confidence: "high",
    },
    place.website
      ? { claim: `Website listed on Google Maps: ${place.website}`, type: "verified", confidence: "high" }
      : { claim: "No website listed on the Google Business Profile", type: "verified", confidence: "high" },
    place.phone
      ? { claim: `Phone listed on Google Maps: ${place.phone}`, type: "verified", confidence: "high" }
      : { claim: "No phone number listed on the Google Business Profile", type: "verified", confidence: "high" },
    place.reviewCount !== null
      ? {
          claim: `Google reviews: ${place.reviewCount} ratings${place.rating !== null ? `, average ${place.rating}` : ""}`,
          type: "verified",
          confidence: "high",
        }
      : { claim: "Review count not returned by Google Places", type: "unknown", confidence: "none" },
    {
      claim: `Business status on Google: ${place.businessStatus ?? "not returned"}`,
      type: place.businessStatus ? "verified" : "unknown",
      confidence: place.businessStatus ? "high" : "none",
    },
  ];

  const codes = await nextEvidenceCodes(supabase, userId, claims.length, now);
  const { error: evErr } = await supabase.from("evidence").insert(
    claims.map((c, i) => ({
      user_id: userId,
      lead_id: leadId,
      evidence_code: codes[i]!,
      claim: c.claim,
      type: c.type,
      source,
      method: "Google Places API (text search) via official API",
      confidence: c.confidence,
      checked_at: now.toISOString(),
    })),
  );
  if (evErr) throw new Error(evErr.message);

  const update: Record<string, unknown> = {};
  if (!lead.website && place.website) update["website"] = place.website;
  if (!lead.phone && place.phone) update["phone"] = place.phone;
  if (place.businessStatus === "CLOSED_PERMANENTLY") {
    update["do_not_contact"] = true;
    update["disqualifier_reason"] = "Business closed (Google Maps: permanently closed)";
    update["stage"] = "closed_lost";
  }
  if (Object.keys(update).length > 0) {
    await supabase.from("leads").update(update).eq("id", leadId);
  }

  await supabase.from("activities").insert({
    user_id: userId,
    lead_id: leadId,
    kind: "enrichment",
    description: `Google Places enrichment — ${claims.length} claims logged (source: ${source}).`,
    metadata: { place_id: place.id, source },
  });

  return {
    matched: true as const,
    claims: claims.length,
    place,
    codes,
    message: `Matched "${place.name}" on Google Maps — ${claims.length} verified claims stored.`,
  };
}

/**
 * Confirms a demo from a REAL calendar event. If no matching event exists,
 * nothing is changed — the stage is never set on assumption.
 */
export async function confirmDemoFromCalendar(
  supabase: SupabaseClient,
  userId: string,
  leadId: string,
) {
  const { data: lead } = await supabase
    .from("leads")
    .select("id,business_name,email")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) throw new Error("Lead not found.");

  const { listUpcomingEvents } = await import("./calendar.server");
  const events = await listUpcomingEvents({ query: lead.business_name, days: 90 });
  const name = String(lead.business_name).toLowerCase();
  const email = (lead.email ?? "").toLowerCase();
  const match = events.find(
    (e) =>
      e.status !== "cancelled" &&
      (e.summary.toLowerCase().includes(name) ||
        e.description.toLowerCase().includes(name) ||
        (email && e.attendees.some((a) => a.toLowerCase() === email))),
  );

  if (!match) {
    return { confirmed: false as const, message: "No matching calendar event found — stage unchanged." };
  }

  const now = new Date();
  const [code] = await nextEvidenceCodes(supabase, userId, 1, now);
  await supabase.from("evidence").insert({
    user_id: userId,
    lead_id: leadId,
    evidence_code: code!,
    claim: `Demo booked: "${match.summary}" on ${match.start ?? "unknown time"}`,
    type: "verified",
    source: match.htmlLink ?? "Google Calendar",
    method: "Google Calendar event lookup",
    confidence: "high",
    checked_at: now.toISOString(),
  });
  await supabase.from("leads").update({ stage: "demo_scheduled" }).eq("id", leadId);
  await supabase.from("activities").insert({
    user_id: userId,
    lead_id: leadId,
    kind: "demo_confirmed",
    description: `Demo confirmed from calendar: ${match.summary} (${match.start ?? "no start time"}) [${code}]`,
    metadata: { event_id: match.id, link: match.htmlLink },
  });

  return { confirmed: true as const, event: match, code: code!, message: `Demo confirmed — ${match.summary}` };
}
