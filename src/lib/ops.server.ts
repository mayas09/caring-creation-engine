import type { SupabaseClient } from "@supabase/supabase-js";

const DAY = 86_400_000;

export type Brief = {
  generatedAt: string;
  yesterday: { sent: number; replied: number; bounced: number; calls: number; demos: number };
  priorities: Array<{ leadId: string; label: string }>;
  suggested: Array<{ leadId: string; name: string; signals: string[] }>;
  alerts: string[];
  throttle: { sentToday: number; limit: number };
  pattern: string | null;
};

/** Deterministic morning brief. Every number is counted from stored rows, never estimated. */
export async function buildBrief(supabase: SupabaseClient, userId: string): Promise<Brief> {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startYesterday = new Date(Date.parse(startToday) - DAY).toISOString();

  const [{ data: settings }, { data: msgs }, { data: calls }, { data: leads }, { data: evidence }] =
    await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("outreach_messages").select("*").eq("user_id", userId),
      supabase.from("calls").select("id,created_at,result").eq("user_id", userId),
      supabase.from("leads").select("*").eq("user_id", userId),
      supabase.from("evidence").select("lead_id,checked_at").eq("user_id", userId),
    ]);

  const inYesterday = (iso: string | null) =>
    Boolean(iso && iso >= startYesterday && iso < startToday);

  const sent = (msgs ?? []).filter((m) => inYesterday(m.sent_at)).length;
  const replied = (msgs ?? []).filter((m) => inYesterday(m.replied_at)).length;
  const bounced = (msgs ?? []).filter((m) => m.status === "failed" && inYesterday(m.sent_at)).length;
  const callsY = (calls ?? []).filter((c) => inYesterday(c.created_at)).length;
  const demos = (leads ?? []).filter((l) => l.stage === "demo_scheduled").length;

  const sentToday = (msgs ?? []).filter((m) => m.sent_at && m.sent_at >= startToday).length;
  const limit = settings?.daily_email_limit ?? 15;
  const ghostDays = settings?.ghost_threshold_days ?? 30;

  const priorities: Brief["priorities"] = [];
  for (const l of leads ?? []) {
    if (l.stage === "replied") priorities.push({ leadId: l.id, label: `Follow up on ${l.business_name} — replied` });
    else if (l.stage === "sent" && l.last_contacted_at) {
      const age = Math.floor((now.getTime() - Date.parse(l.last_contacted_at)) / DAY);
      if (age >= ghostDays) {
        priorities.push({ leadId: l.id, label: `${l.business_name}: silent ${age} days (threshold ${ghostDays}) — bump or archive?` });
      }
    }
  }

  const suggested = (leads ?? [])
    .filter((l) => l.approval_status === "pending" && !l.do_not_contact)
    .slice(0, 5)
    .map((l) => ({
      leadId: l.id,
      name: l.business_name,
      signals: ((l.why_this_lead as string[] | null) ?? []).slice(0, 3),
    }));

  const alerts: string[] = [];
  const stalled = (leads ?? []).filter(
    (l) => l.stage === "replied" && l.last_contacted_at && now.getTime() - Date.parse(l.last_contacted_at) > 5 * DAY,
  ).length;
  if (stalled > 0) alerts.push(`${stalled} leads in "Replied" with no action for 5+ days`);
  alerts.push(`Email volume: ${sentToday}/${limit} today (configured limit, not a safety claim)`);

  const staleLeads = new Set(
    (evidence ?? [])
      .filter((e) => now.getTime() - Date.parse(e.checked_at) > 30 * DAY)
      .map((e) => e.lead_id),
  );
  if (staleLeads.size > 0) alerts.push(`${staleLeads.size} leads have evidence older than 30 days — recheck before outreach`);

  const totalSent = (msgs ?? []).filter((m) => m.sent_at).length;
  const totalReplies = (msgs ?? []).filter((m) => m.replied_at).length;
  const pattern =
    totalSent >= 5
      ? `Observed pattern (inference, not a guarantee): ${totalReplies} replies from ${totalSent} sent messages. Verify each lead individually.`
      : null;

  return {
    generatedAt: now.toISOString(),
    yesterday: { sent, replied, bounced, calls: callsY, demos },
    priorities: priorities.slice(0, 8),
    suggested,
    alerts,
    throttle: { sentToday, limit },
    pattern,
  };
}

/** Applies ghost threshold and stale-evidence flags. Pure bookkeeping, no invented data. */
export async function runMaintenance(supabase: SupabaseClient, userId: string) {
  const now = Date.now();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("ghost_threshold_days")
    .eq("user_id", userId)
    .maybeSingle();
  const threshold = settings?.ghost_threshold_days ?? 30;

  const { data: leads } = await supabase
    .from("leads")
    .select("id,business_name,stage,last_contacted_at")
    .eq("user_id", userId)
    .in("stage", ["sent", "queued"]);

  let ghosted = 0;
  for (const l of leads ?? []) {
    if (!l.last_contacted_at) continue;
    const age = Math.floor((now - Date.parse(l.last_contacted_at)) / DAY);
    if (age >= threshold) {
      await supabase.from("leads").update({ stage: "ghost", ghosted_at: new Date().toISOString() }).eq("id", l.id);
      await supabase.from("activities").insert({
        user_id: userId,
        lead_id: l.id,
        kind: "ghost",
        description: `Moved to Ghost — ${age} days without reply (threshold ${threshold}).`,
        metadata: { days: age, threshold },
      });
      ghosted++;
    }
  }

  const { data: evidence } = await supabase
    .from("evidence")
    .select("id,lead_id,checked_at")
    .eq("user_id", userId);
  const stale = (evidence ?? []).filter((e) => now - Date.parse(e.checked_at) > 30 * DAY);

  return { ghosted, staleEvidence: stale.length, threshold };
}

/** Re-verifies a queued message against current evidence freshness before sending. */
export async function finalVerification(supabase: SupabaseClient, userId: string, messageId: string) {
  const { data: msg } = await supabase
    .from("outreach_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) throw new Error("Message not found.");

  const { data: evidence } = await supabase
    .from("evidence")
    .select("evidence_code,claim,type,checked_at")
    .eq("lead_id", msg.lead_id);

  const now = Date.now();
  const issues: string[] = [];
  const used = (msg.evidence_codes ?? []) as string[];
  const byCode = new Map((evidence ?? []).map((e) => [e.evidence_code, e]));

  for (const code of used) {
    const e = byCode.get(code);
    if (!e) {
      issues.push(`${code}: evidence no longer exists`);
      continue;
    }
    const days = Math.floor((now - Date.parse(e.checked_at)) / DAY);
    if (days > 30) issues.push(`${code}: stale (${days} days) — recheck required`);
    else if (days > 7) issues.push(`${code}: needs recheck (${days} days) before critical claims`);
    if (e.type === "unknown" || e.type === "inferred") {
      issues.push(`${code}: labeled ${e.type} — cannot be presented as fact`);
    }
  }
  if (used.length === 0) issues.push("Draft references no evidence codes");

  const passed = issues.length === 0;
  await supabase
    .from("outreach_messages")
    .update({
      verification: { ...(msg.verification as Record<string, unknown>), final: { passed, issues } },
      verification_passed: passed && Boolean(msg.verification_passed),
      status: passed && msg.verification_passed ? "verified" : "draft",
    })
    .eq("id", messageId);

  await supabase.from("activities").insert({
    user_id: userId,
    lead_id: msg.lead_id,
    kind: "verification",
    description: passed
      ? `Final verification passed — codes checked: ${used.join(", ")}`
      : `Final verification failed — ${issues.length} issues`,
    metadata: { issues },
  });

  return { passed, issues, codes: used };
}
