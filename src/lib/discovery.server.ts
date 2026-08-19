import type { SupabaseClient } from "@supabase/supabase-js";
import { SELLX_SYSTEM_PROMPT } from "./ai.server";
import { structuredCall } from "./research.server";

export const DISCOVERY_FILTERS = [
  "no_website_found",
  "website_no_ordering",
  "observable_ux_issues",
  "social_only",
  "no_google_business_profile",
  "low_review_count",
  "high_reviews_no_website",
  "uses_third_party_ordering",
  "independent_not_chain",
  "one_to_three_locations",
] as const;

export const DISCOVERY_SOURCES = [
  "Google Maps",
  "Yelp",
  "Instagram",
  "TikTok",
  "Facebook Pages",
  "LinkedIn",
  "Reddit",
  "TripAdvisor",
  "Apple Maps",
] as const;

export const DISQUALIFIERS = [
  { key: "large_chain", label: "Large chain / franchise", flag: "Corporate decision-maker not reachable" },
  { key: "excellent_direct_ordering", label: "Already has excellent direct ordering", flag: "No identifiable problem" },
  { key: "no_opportunity", label: "No evidence-backed opportunity", flag: "No compelling sales opportunity" },
  { key: "closed", label: "Business appears closed", flag: "Business closed" },
  { key: "under_construction", label: "Website under construction", flag: "Not yet operational" },
  { key: "franchise_corporate", label: "Franchise — corporate decision", flag: "Franchise — corporate decision" },
  { key: "no_contact", label: "No viable contact method", flag: "No contact channel" },
  { key: "previously_rejected", label: "Previously rejected", flag: "Previously rejected" },
] as const;

type Candidate = {
  business_name: string;
  industry: string;
  city: string;
  country: string;
  website: string;
  instagram: string;
  known_facts: string[];
  what_to_check: string[];
  suggested_angle: string;
  disqualifier: string;
};

const CANDIDATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates", "method_note"],
  properties: {
    method_note: { type: "string" },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "business_name",
          "industry",
          "city",
          "country",
          "website",
          "instagram",
          "known_facts",
          "what_to_check",
          "suggested_angle",
          "disqualifier",
        ],
        properties: {
          business_name: { type: "string" },
          industry: { type: "string" },
          city: { type: "string" },
          country: { type: "string" },
          website: { type: "string" },
          instagram: { type: "string" },
          known_facts: { type: "array", items: { type: "string" } },
          what_to_check: { type: "array", items: { type: "string" } },
          suggested_angle: { type: "string" },
          disqualifier: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Finds candidate businesses with a LIVE web search (Firecrawl), then structures the
 * search results into candidates. Every candidate keeps the real source URL it came from;
 * anything not present in a search result stays Unknown.
 */
export async function runDiscovery(
  supabase: SupabaseClient,
  userId: string,
  input: {
    industry: string;
    location: string;
    filters: string[];
    sources: string[];
    limit: number;
    notes?: string | undefined;
  },
) {
  const { webSearch } = await import("./providers.server");

  const queries = [
    `${input.industry} in ${input.location}`,
    `${input.industry} ${input.location} official website menu`,
    ...(input.filters.includes("uses_third_party_ordering")
      ? [`${input.industry} ${input.location} order online delivery`]
      : []),
    ...(input.filters.includes("social_only")
      ? [`${input.industry} ${input.location} instagram`]
      : []),
  ];

  const hitLists = await Promise.all(
    queries.map((q) =>
      webSearch(q, Math.min(10, input.limit * 2)).catch(() => [] as Awaited<ReturnType<typeof webSearch>>),
    ),
  );
  const seen = new Set<string>();
  const hits = hitLists.flat().filter((h) => {
    const k = h.url.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (hits.length === 0) {
    throw new Error("Live web search returned no results for that industry and location.");
  }

  const result = await structuredCall<{ candidates: Candidate[]; method_note: string }>({
    system: SELLX_SYSTEM_PROMPT,
    user: `Extract up to ${input.limit} candidate businesses to RESEARCH from these REAL web search results.

Industry: ${input.industry}
Location: ${input.location}
Requested filters: ${input.filters.join(", ") || "none"}
Sources the user also plans to check: ${input.sources.join(", ") || "none"}
User notes: ${input.notes || "none"}

LIVE SEARCH RESULTS (the only source you may use):
${hits.map((h, i) => `[${i + 1}] ${h.title}\n    url: ${h.url}\n    snippet: ${h.description}`).join("\n")}

HARD RULES:
- Only include businesses that actually appear in the results above. Never add a name from memory.
- website MUST be one of the URLs above (prefer the business's own site over a directory/aggregator page), or empty.
- instagram MUST be an instagram.com URL from the results above, or empty.
- known_facts: only facts visible in the titles/snippets above; each fact must end with " (source: <url>)".
- Never invent phone numbers, emails, review counts, ratings, revenue or commission rates.
- Skip directory/listicle pages (Yelp lists, "best 10 ..." articles) as businesses.
- what_to_check lists the concrete checks still needed (ordering flow, menu, contact).
- disqualifier: empty unless the results clearly show a chain/franchise or a closed business.
- method_note: one honest sentence naming live web search as the source and its limits.`,
    schemaName: "discovery_candidates",
    schema: CANDIDATE_SCHEMA as unknown as Record<string, unknown>,
  });


  const { data: search, error: searchErr } = await supabase
    .from("discovery_searches")
    .insert({
      user_id: userId,
      industry: input.industry,
      location: input.location,
      filters: input.filters,
      sources: input.sources,
      notes: input.notes ?? null,
      result_count: result.candidates.length,
    })
    .select()
    .single();
  if (searchErr) throw new Error(searchErr.message);

  const { data: dnc } = await supabase.from("dnc_entries").select("value").eq("user_id", userId);
  const blocked = new Set((dnc ?? []).map((d) => d.value.toLowerCase().trim()));
  const { data: rejected } = await supabase
    .from("leads")
    .select("business_name")
    .eq("user_id", userId)
    .eq("stage", "closed_lost");
  const rejectedNames = new Set((rejected ?? []).map((r) => r.business_name.toLowerCase().trim()));

  const created: Array<{ id: string; business_name: string; disqualifier: string }> = [];

  const DIRECTORY = /tripadvisor|yelp|yellowpages|foursquare|zomato|wikipedia|reddit|facebook\.com|instagram\.com|google\.[a-z]|ubereats|deliveroo|glovo|justeat|doordash|thefork|opentable/i;

  for (const c of result.candidates) {
    const name = c.business_name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const previouslyRejected = rejectedNames.has(key);
    const dncHit = blocked.has(key) || (c.website ? blocked.has(c.website.toLowerCase()) : false);
    const disqualifier = previouslyRejected
      ? "Previously rejected"
      : dncHit
        ? "On do-not-contact list"
        : c.disqualifier.trim();

    // A directory/aggregator page is not the business's own website — keep the field Unknown.
    const ownSite = c.website && !DIRECTORY.test(c.website) ? c.website : null;
    const directoryUrl = c.website && !ownSite ? c.website : null;
    const checks = [
      ...c.what_to_check,
      ...(directoryUrl ? [`Find the official website — only a directory listing was found: ${directoryUrl}`] : []),
    ];

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        user_id: userId,
        business_name: name,
        industry: c.industry || input.industry,
        city: c.city || input.location,
        country: c.country || null,
        website: ownSite,
        instagram: c.instagram || null,

        source: "live_web_search",
        discovery_search_id: search.id,
        stage: "new",
        approval_status: disqualifier ? "rejected" : "pending",
        do_not_contact: Boolean(disqualifier),
        disqualify_reason: disqualifier || null,
        best_angle: c.suggested_angle || null,
        why_this_lead: [],
        notes: c.what_to_check.length ? `Checks needed:\n- ${c.what_to_check.join("\n- ")}` : null,
      })
      .select("id")
      .single();
    if (error) continue;

    const rows = c.known_facts.map((f) => {
      const src = /source:\s*(https?:\/\/\S+?)\)?$/i.exec(f.trim())?.[1] ?? null;
      return {
        user_id: userId,
        lead_id: lead.id,
        title: f,
        detail: src
          ? "Taken from a live web search result. Confirm on the page itself before quoting it."
          : "Extracted from search results without a source URL — treat as unverified.",
        strength: "unknown" as const,
        confidence: src ? ("low" as const) : ("none" as const),
        source: src ?? "live web search (no URL captured)",
      };
    });
    if (rows.length) await supabase.from("signals").insert(rows);


    await supabase.from("activities").insert({
      user_id: userId,
      lead_id: lead.id,
      kind: "discovery",
      description: disqualifier
        ? `Discovered and auto-flagged as bad fit: ${disqualifier}`
        : "Discovered as an unverified candidate — awaiting evidence audit and approval.",
      metadata: { search_id: search.id, what_to_check: c.what_to_check },
    });

    created.push({ id: lead.id, business_name: name, disqualifier });
  }

  return { searchId: search.id, methodNote: result.method_note, created };
}

/** Deterministic negative qualification from stored evidence only. */
export async function negativeQualify(supabase: SupabaseClient, userId: string, leadId: string) {
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) throw new Error("Lead not found.");
  const { data: gap } = await supabase.from("ordering_gaps").select("*").eq("lead_id", leadId).maybeSingle();
  const { data: signals } = await supabase.from("signals").select("*").eq("lead_id", leadId);
  const { data: friction } = await supabase.from("friction_points").select("*").eq("lead_id", leadId);
  const { data: dnc } = await supabase.from("dnc_entries").select("value").eq("user_id", userId);

  const reasons: string[] = [];
  if ((lead.locations_count ?? 0) > 3 || lead.is_chain) reasons.push("Corporate decision-maker not reachable");
  if (gap?.direct_ordering === "verified" && (friction ?? []).every((f) => f.level === "low")) {
    reasons.push("No identifiable problem");
  }
  if (!lead.email && !lead.phone && !lead.instagram && !lead.facebook) reasons.push("No contact channel");
  if (lead.stage === "closed_lost") reasons.push("Previously rejected");
  const values = new Set((dnc ?? []).map((d) => d.value.toLowerCase()));
  if (
    (lead.email && values.has(lead.email.toLowerCase())) ||
    (lead.phone && values.has(lead.phone.toLowerCase())) ||
    values.has(lead.business_name.toLowerCase())
  ) {
    reasons.push("On do-not-contact list");
  }
  const hasOpportunity =
    (signals ?? []).some((s) => s.strength === "strong" || s.strength === "medium") ||
    (gap?.third_party_platforms?.length ?? 0) > 0 ||
    (friction ?? []).some((f) => f.level !== "low");
  if (!hasOpportunity) reasons.push("No compelling sales opportunity");

  const badFit = reasons.length > 0;
  await supabase
    .from("leads")
    .update({
      do_not_contact: badFit,
      disqualify_reason: badFit ? reasons.join("; ") : null,
      classification: badFit ? "bad_fit" : lead.classification,
    })
    .eq("id", leadId);

  await supabase.from("activities").insert({
    user_id: userId,
    lead_id: leadId,
    kind: "qualification",
    description: badFit
      ? `Negative qualification: do not contact — ${reasons.join("; ")}`
      : "Negative qualification passed — an evidence-backed opportunity exists.",
    metadata: { reasons },
  });

  return { badFit, reasons };
}
