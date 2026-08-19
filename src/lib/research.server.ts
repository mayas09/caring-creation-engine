import type { SupabaseClient } from "@supabase/supabase-js";
import { SELLX_SYSTEM_PROMPT } from "./ai.server";

const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-5.6-sol";

type JsonSchema = Record<string, unknown>;

/** Calls the AI gateway Responses API and returns parsed structured JSON. */
export async function structuredCall<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
}): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");

  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: opts.schemaName,
          strict: true,
          schema: opts.schema,
        },
      },
    }),
  });

  if (res.status === 429) throw new Error("Rate limit reached. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await res.text()}`);

  const json = (await res.json()) as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };

  const text =
    json.output_text ??
    json.output
      ?.flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("") ??
    "";

  if (!text.trim()) throw new Error("AI returned an empty response.");
  return JSON.parse(text) as T;
}

const EVIDENCE_TYPE = ["verified", "calculated", "inferred", "unknown"] as const;

type AuditResult = {
  classification: "opportunity" | "strong_opportunity" | "medium_opportunity" | "low_priority" | "bad_fit";
  priority: "high" | "medium" | "low";
  best_angle: string;
  why_this_lead: string[];
  ordering_gap: {
    website_found: (typeof EVIDENCE_TYPE)[number];
    menu_found: (typeof EVIDENCE_TYPE)[number];
    online_ordering: (typeof EVIDENCE_TYPE)[number];
    direct_ordering: (typeof EVIDENCE_TYPE)[number];
    third_party_platforms: string[];
    order_button_destination: string;
    gap_summary: string;
  };
  signals: Array<{
    title: string;
    detail: string;
    strength: "strong" | "medium" | "weak" | "unknown";
    confidence: "high" | "medium" | "low" | "none";
    source: string;
  }>;
  friction_points: Array<{ point: string; level: "high" | "medium" | "low"; evidence: string; source: string }>;
  evidence: Array<{
    claim: string;
    type: (typeof EVIDENCE_TYPE)[number];
    source: string;
    method: string;
    confidence: "high" | "medium" | "low" | "none";
  }>;
  checks_needed: string[];
};

const AUDIT_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "classification",
    "priority",
    "best_angle",
    "why_this_lead",
    "ordering_gap",
    "signals",
    "friction_points",
    "evidence",
    "checks_needed",
  ],
  properties: {
    classification: {
      type: "string",
      enum: ["opportunity", "strong_opportunity", "medium_opportunity", "low_priority", "bad_fit"],
    },
    priority: { type: "string", enum: ["high", "medium", "low"] },
    best_angle: { type: "string" },
    why_this_lead: { type: "array", items: { type: "string" } },
    ordering_gap: {
      type: "object",
      additionalProperties: false,
      required: [
        "website_found",
        "menu_found",
        "online_ordering",
        "direct_ordering",
        "third_party_platforms",
        "order_button_destination",
        "gap_summary",
      ],
      properties: {
        website_found: { type: "string", enum: EVIDENCE_TYPE as unknown as string[] },
        menu_found: { type: "string", enum: EVIDENCE_TYPE as unknown as string[] },
        online_ordering: { type: "string", enum: EVIDENCE_TYPE as unknown as string[] },
        direct_ordering: { type: "string", enum: EVIDENCE_TYPE as unknown as string[] },
        third_party_platforms: { type: "array", items: { type: "string" } },
        order_button_destination: { type: "string" },
        gap_summary: { type: "string" },
      },
    },
    signals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "strength", "confidence", "source"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          strength: { type: "string", enum: ["strong", "medium", "weak", "unknown"] },
          confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
          source: { type: "string" },
        },
      },
    },
    friction_points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["point", "level", "evidence", "source"],
        properties: {
          point: { type: "string" },
          level: { type: "string", enum: ["high", "medium", "low"] },
          evidence: { type: "string" },
          source: { type: "string" },
        },
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "type", "source", "method", "confidence"],
        properties: {
          claim: { type: "string" },
          type: { type: "string", enum: EVIDENCE_TYPE as unknown as string[] },
          source: { type: "string" },
          method: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
        },
      },
    },
    checks_needed: { type: "array", items: { type: "string" } },
  },
};

function evidenceCode(seq: number, date = new Date()): string {
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `EV-${date.getFullYear()}-${md}-${String(seq).padStart(3, "0")}`;
}

/** Runs an evidence audit for one lead and persists gap, signals, friction and the evidence ledger. */
export async function auditLead(supabase: SupabaseClient, userId: string, leadId: string) {
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) throw new Error("Lead not found.");

  const { scrapePage, extractPageFacts, webSearch } = await import("./providers.server");

  // 1) Live observation: scrape the site, or search for it when we have no URL.
  let siteUrl: string | null = lead.website ?? null;
  let searchNote = "";
  if (!siteUrl) {
    const hits = await webSearch(
      `${lead.business_name} ${lead.city ?? ""} ${lead.industry ?? ""} official website`.trim(),
      5,
    ).catch(() => []);
    searchNote = hits.map((h) => `- ${h.title} — ${h.url}\n  ${h.description}`).join("\n") || "- none";
    const own = hits.find(
      (h) => !/yelp|tripadvisor|facebook|instagram|google\.|wikipedia|reddit|ubereats|doordash/i.test(h.url),
    );
    siteUrl = own?.url ?? null;
  }

  let facts: ReturnType<typeof extractPageFacts> | null = null;
  let scrapeError: string | null = null;
  let pageExcerpt = "";
  if (siteUrl) {
    try {
      const page = await scrapePage(siteUrl);
      facts = extractPageFacts(page);
      pageExcerpt = page.markdown.slice(0, 6000);
    } catch (e) {
      scrapeError = e instanceof Error ? e.message : "scrape failed";
    }
  }

  const observed = facts
    ? `OBSERVED ON ${siteUrl} (live scrape, ${new Date().toISOString()}):
- HTTP status: ${facts.statusCode ?? "unknown"} (reachable: ${facts.reachable})
- Page title: ${facts.title || "(none)"}
- Third-party ordering/booking platforms linked: ${facts.thirdParty.join(", ") || "none found"}
- Menu links found: ${facts.menuLinks.join(", ") || "none"}
- Order/cart/checkout links found: ${facts.orderLinks.join(", ") || "none"}
- "Order online" wording present: ${facts.hasOrderWord}
- Contact emails on page: ${facts.emails.join(", ") || "none"}
- Phones on page: ${facts.phones.join(", ") || "none"}
- Socials: ${Object.entries(facts.socials).map(([k, v]) => `${k}=${v ?? "none"}`).join(", ")}

PAGE CONTENT EXCERPT:
${pageExcerpt}`
    : `NO PAGE OBSERVED. ${scrapeError ? `Scrape failed: ${scrapeError}.` : "No website URL known."}
${searchNote ? `Live search results:\n${searchNote}` : ""}`;

  const known = JSON.stringify(lead, null, 2);
  const user = `Audit this business as a direct-ordering opportunity.

STORED FIELDS (may be treated as [Verified]):
${known}

${observed}

Rules:
- "verified" is allowed ONLY for facts in the stored fields or directly visible in the OBSERVED block above; cite the source URL in the source field.
- Anything not observed is "unknown" — add the concrete check to checks_needed.
- Never invent URLs, platform names, revenue, order volumes or commission rates.
- gap_summary and best_angle must be one short, honest sentence each, no hype.
- Empty strings are allowed where nothing is known.`;

  const result = await structuredCall<AuditResult>({
    system: SELLX_SYSTEM_PROMPT,
    user,
    schemaName: "lead_audit",
    schema: AUDIT_SCHEMA,
  });

  const now = new Date();

  // 2) Deterministic evidence from the live page — not model output.
  if (facts && siteUrl) {
    const src = siteUrl;
    const observedEvidence: AuditResult["evidence"] = [
      {
        claim: `Website ${src} responded with HTTP ${facts.statusCode ?? "200"}${facts.title ? ` — "${facts.title}"` : ""}`,
        type: "verified",
        source: src,
        method: "Live page fetch",
        confidence: "high",
      },
      {
        claim: facts.thirdParty.length
          ? `Page links to third-party ordering/booking platforms: ${facts.thirdParty.join(", ")}`
          : "No third-party ordering platform link found on the scraped page",
        type: "verified",
        source: src,
        method: "Link scan of scraped page",
        confidence: facts.thirdParty.length ? "high" : "medium",
      },
      {
        claim: facts.orderLinks.length
          ? `Order/checkout links found on page: ${facts.orderLinks.slice(0, 3).join(", ")}`
          : "No order/cart/checkout link found on the scraped page",
        type: "verified",
        source: src,
        method: "Link scan of scraped page",
        confidence: "medium",
      },
    ];
    result.evidence = [...observedEvidence, ...result.evidence];
    if (facts.thirdParty.length) {
      result.ordering_gap.third_party_platforms = Array.from(
        new Set([...facts.thirdParty, ...result.ordering_gap.third_party_platforms]),
      );
    }
    result.ordering_gap.website_found = facts.reachable ? "verified" : result.ordering_gap.website_found;
    if (facts.menuLinks.length || facts.hasMenuWord) result.ordering_gap.menu_found = "verified";
  }

  const gap = result.ordering_gap;
  const codes = result.evidence.map((_, i) => evidenceCode(i + 1, now));


  await supabase.from("evidence").delete().eq("lead_id", leadId).eq("user_id", userId);
  if (result.evidence.length > 0) {
    const { error: evErr } = await supabase.from("evidence").insert(
      result.evidence.map((e, i) => ({
        user_id: userId,
        lead_id: leadId,
        evidence_code: codes[i]!,
        claim: e.claim,
        type: e.type,
        source: e.source || null,
        method: e.method || null,
        confidence: e.confidence,
        checked_at: now.toISOString(),
      })),
    );
    if (evErr) throw new Error(evErr.message);
  }

  const { error: gapErr } = await supabase.from("ordering_gaps").upsert(
    {
      lead_id: leadId,
      user_id: userId,
      website_found: gap.website_found,
      menu_found: gap.menu_found,
      online_ordering: gap.online_ordering,
      direct_ordering: gap.direct_ordering,
      has_website: gap.website_found === "verified" ? true : null,
      has_online_ordering: gap.online_ordering === "verified" ? true : null,
      third_party_platforms: gap.third_party_platforms,
      order_button_destination: gap.order_button_destination || null,
      gap_summary: gap.gap_summary || null,
      evidence_codes: codes,
      checked_at: now.toISOString(),
    },
    { onConflict: "lead_id" },
  );
  if (gapErr) throw new Error(gapErr.message);

  await supabase.from("signals").delete().eq("lead_id", leadId).eq("user_id", userId);
  if (result.signals.length > 0) {
    await supabase.from("signals").insert(
      result.signals.map((s) => ({
        user_id: userId,
        lead_id: leadId,
        title: s.title,
        detail: s.detail || null,
        strength: s.strength,
        confidence: s.confidence,
        source: s.source || null,
        evidence_codes: codes,
      })),
    );
  }

  await supabase.from("friction_points").delete().eq("lead_id", leadId).eq("user_id", userId);
  if (result.friction_points.length > 0) {
    await supabase.from("friction_points").insert(
      result.friction_points.map((f) => ({
        user_id: userId,
        lead_id: leadId,
        point: f.point,
        level: f.level,
        evidence: f.evidence || null,
        source: f.source || null,
      })),
    );
  }

  await supabase
    .from("leads")
    .update({
      classification: result.classification,
      priority: result.priority,
      best_angle: result.best_angle || null,
      why_this_lead: result.why_this_lead,
      stage: lead.stage === "new" ? "reviewed" : lead.stage,
    })
    .eq("id", leadId);

  await supabase.from("activities").insert({
    user_id: userId,
    lead_id: leadId,
    kind: "audit",
    description: `Evidence audit run — ${result.evidence.length} claims logged, ${result.checks_needed.length} checks still needed.`,
    metadata: { checks_needed: result.checks_needed },
  });

  return { ...result, evidence_codes: codes };
}

const HYPE = [
  "guarantee",
  "guaranteed",
  "explode",
  "skyrocket",
  "revolutionary",
  "10x",
  "act now",
  "last chance",
  "limited time",
  "risk-free",
];

export type Verification = {
  passed: boolean;
  issues: string[];
  numbers: string[];
  wordCount: number;
};

/** Deterministic honesty check: unsupported numbers, hype words and length. */
export function verifyMessage(body: string, subject: string, evidenceClaims: string[]): Verification {
  const issues: string[] = [];
  const text = `${subject}\n${body}`;
  const haystack = evidenceClaims.join(" ").toLowerCase();

  const numbers = Array.from(text.matchAll(/\b\d[\d.,]*%?\b/g)).map((m) => m[0]);
  const unsupported = numbers.filter((n) => !haystack.includes(n.toLowerCase()));
  if (unsupported.length > 0) {
    issues.push(`Numbers not backed by stored evidence: ${unsupported.join(", ")}`);
  }

  const hype = HYPE.filter((w) => text.toLowerCase().includes(w));
  if (hype.length > 0) issues.push(`Hype or pressure language: ${hype.join(", ")}`);

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 180) issues.push(`Body is ${wordCount} words — keep outreach under 180.`);
  if (subject.length > 60) issues.push(`Subject is ${subject.length} chars — keep it under 60.`);
  if (evidenceClaims.length === 0) issues.push("No evidence on file for this lead — draft is unsupported.");

  return { passed: issues.length === 0, issues, numbers: unsupported, wordCount };
}

/** Drafts an outreach message, verifies it and stores it as a draft row. */
export async function draftAndStoreMessage(
  supabase: SupabaseClient,
  userId: string,
  opts: { leadId: string; campaignId?: string; style: string; ctaStyle: string },
) {
  const { data: lead } = await supabase.from("leads").select("*").eq("id", opts.leadId).maybeSingle();
  if (!lead) throw new Error("Lead not found.");
  if (lead.do_not_contact) throw new Error("This lead is marked do-not-contact.");

  const { data: evidence } = await supabase
    .from("evidence")
    .select("evidence_code,claim,type,source,confidence")
    .eq("lead_id", opts.leadId);
  const { data: gap } = await supabase
    .from("ordering_gaps")
    .select("*")
    .eq("lead_id", opts.leadId)
    .maybeSingle();

  const context = JSON.stringify({ lead, evidence, orderingGap: gap }, null, 2);

  const result = await structuredCall<{
    subject: string;
    body: string;
    evidence_codes: string[];
    reasoning: string;
  }>({
    system: SELLX_SYSTEM_PROMPT,
    user: `Write a cold outreach email using ONLY the labeled evidence below.
Length: ${opts.style}. CTA style: ${opts.ctaStyle}.
Rules: no invented numbers, no hype, no fake urgency; subject under 60 chars; body under 180 words;
reference only claims that exist in the evidence list; end with a low-pressure ask.
List the evidence codes you actually used.

CONTEXT:
${context}`,
    schemaName: "outreach_draft",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["subject", "body", "evidence_codes", "reasoning"],
      properties: {
        subject: { type: "string" },
        body: { type: "string" },
        evidence_codes: { type: "array", items: { type: "string" } },
        reasoning: { type: "string" },
      },
    },
  });

  const claims = (evidence ?? []).map((e) => `${e.evidence_code} ${e.claim}`);
  const verification = verifyMessage(result.body, result.subject, claims);

  const { data: row, error } = await supabase
    .from("outreach_messages")
    .insert({
      user_id: userId,
      lead_id: opts.leadId,
      campaign_id: opts.campaignId ?? null,
      channel: "email",
      subject: result.subject,
      body: result.body,
      reasoning: { reasoning: result.reasoning, style: opts.style, cta: opts.ctaStyle },
      evidence_codes: result.evidence_codes,
      word_count: verification.wordCount,
      status: verification.passed ? "verified" : "draft",
      verification: verification as unknown as Record<string, unknown>,
      verification_passed: verification.passed,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("activities").insert({
    user_id: userId,
    lead_id: opts.leadId,
    kind: "draft",
    description: `Outreach draft generated — verification ${verification.passed ? "passed" : "failed"}.`,
    metadata: { issues: verification.issues },
  });

  if (lead.stage === "new" || lead.stage === "reviewed") {
    await supabase.from("leads").update({ stage: "contact_drafted" }).eq("id", opts.leadId);
  }

  return { message: row, verification };
}
