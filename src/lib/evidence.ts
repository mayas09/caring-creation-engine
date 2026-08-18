export type EvidenceType = "verified" | "calculated" | "inferred" | "unknown";
export type ConfidenceLevel = "high" | "medium" | "low" | "none";
export type Freshness = "recent" | "needs_recheck" | "stale";

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  verified: "Verified",
  calculated: "Calculated",
  inferred: "Inferred",
  unknown: "Unknown",
};

export const EVIDENCE_TYPE_CLASS: Record<EvidenceType, string> = {
  verified: "bg-success/15 text-success border-success/30",
  calculated: "bg-info/15 text-info border-info/30",
  inferred: "bg-warning/15 text-warning border-warning/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

export function daysSince(date: string | Date): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export function freshnessOf(checkedAt: string | Date): Freshness {
  const days = daysSince(checkedAt);
  if (days < 7) return "recent";
  if (days <= 30) return "needs_recheck";
  return "stale";
}

export const FRESHNESS_META: Record<Freshness, { label: string; dot: string; className: string }> = {
  recent: { label: "Recent", dot: "🟢", className: "text-success" },
  needs_recheck: { label: "Needs Recheck", dot: "🟡", className: "text-warning" },
  stale: { label: "Stale", dot: "🔴", className: "text-danger" },
};

export function formatChecked(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

/** Evidence IDs follow EV-YYYY-MMDD-NNN */
export function makeEvidenceCode(seq: number, date = new Date()): string {
  const y = date.getFullYear();
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `EV-${y}-${md}-${String(seq).padStart(3, "0")}`;
}

export const CLASSIFICATION_LABEL: Record<string, string> = {
  opportunity: "Opportunity",
  strong_opportunity: "Strong Opportunity",
  medium_opportunity: "Medium Opportunity",
  low_priority: "Low Priority",
  bad_fit: "Bad Fit — Do Not Contact",
};

export const STAGE_LABEL: Record<string, string> = {
  new: "New",
  reviewed: "Reviewed",
  contact_drafted: "Contact Drafted",
  queued: "Queued",
  sent: "Sent",
  replied: "Replied",
  demo_scheduled: "Demo Scheduled",
  proposal_sent: "Proposal Sent",
  negotiating: "Negotiating",
  closed_won: "Closed-Won",
  closed_lost: "Closed-Lost",
  ghost: "Ghost",
};

export const STAGE_ORDER = Object.keys(STAGE_LABEL) as Array<keyof typeof STAGE_LABEL>;
