import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Radar, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { discoverLeads } from "@/lib/discovery.functions";

export const Route = createFileRoute("/_authenticated/discovery")({
  head: () => ({
    meta: [
      { title: "Lead Discovery — LeadGen AI Pro" },
      {
        name: "description",
        content:
          "Run evidence-first lead discovery by industry, location and filters. Every candidate starts unverified.",
      },
      { property: "og:title", content: "Lead Discovery — LeadGen AI Pro" },
      { property: "og:description", content: "Industry and location search that returns candidates, not claims." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiscoveryPage,
});

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "no_website_found", label: "No website found on checked sources" },
  { key: "website_no_ordering", label: "Website exists but no online ordering" },
  { key: "observable_ux_issues", label: "Observable UX issues" },
  { key: "social_only", label: "Social media only" },
  { key: "no_google_business_profile", label: "No Google Business Profile found" },
  { key: "low_review_count", label: "Low review count (< 50)" },
  { key: "high_reviews_no_website", label: "High reviews but no website" },
  { key: "uses_third_party_ordering", label: "Uses third-party ordering" },
  { key: "independent_not_chain", label: "Independent (not chain/franchise)" },
  { key: "one_to_three_locations", label: "1–3 locations" },
];

const SOURCES = [
  "Google Maps",
  "Yelp",
  "Instagram",
  "TikTok",
  "Facebook Pages",
  "LinkedIn",
  "Reddit",
  "TripAdvisor",
  "Apple Maps",
];

function DiscoveryPage() {
  const qc = useQueryClient();
  const discover = useServerFn(discoverLeads);
  const [industry, setIndustry] = useState("Coffee shops");
  const [location, setLocation] = useState("");
  const [filters, setFilters] = useState<string[]>(["uses_third_party_ordering", "independent_not_chain"]);
  const [sources, setSources] = useState<string[]>(["Google Maps", "Instagram"]);
  const [notes, setNotes] = useState("");
  const [limit, setLimit] = useState(5);
  const [running, setRunning] = useState(false);
  const [methodNote, setMethodNote] = useState<string | null>(null);

  const { data: searches } = useQuery({
    queryKey: ["discovery_searches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovery_searches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const { data: pending } = useQuery({
    queryKey: ["pending_leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,business_name,city,website,approval_status,do_not_contact,disqualify_reason,notes")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function run() {
    if (location.trim().length < 2) {
      toast.error("Enter a location");
      return;
    }
    setRunning(true);
    try {
      const res = await discover({
        data: { industry, location, filters, sources, limit, notes: notes || undefined },
      });
      setMethodNote(res.methodNote);
      const flagged = res.created.filter((c) => c.disqualifier).length;
      toast.success(
        `${res.created.length} candidates saved${flagged ? ` — ${flagged} auto-flagged as bad fit` : ""}.`,
      );
      void qc.invalidateQueries({ queryKey: ["pending_leads"] });
      void qc.invalidateQueries({ queryKey: ["discovery_searches"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Lead discovery</h1>
        <p className="text-sm text-muted-foreground">
          Candidates only. Nothing here is verified until you audit it against a live source.
        </p>
      </header>

      <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
        <ShieldAlert className="mr-1 inline size-3.5" />
        No Google Maps, Yelp or social API is connected. Discovery produces research candidates labeled
        Unknown, with the exact checks needed. Source data policies are configurable in Settings and must be
        verified before any automated retrieval is enabled.
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search parameters</CardTitle>
          <CardDescription>Industry, location, filters, and the sources you will check.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                value={location}
                placeholder="City, state, country"
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Candidates</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={limit}
                onChange={(e) => setLimit(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Filters</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {FILTERS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={filters.includes(f.key)}
                    onCheckedChange={() => toggle(filters, setFilters, f.key)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sources you will check</Label>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(sources, setSources, s)}
                  className={
                    sources.includes(s)
                      ? "rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-xs text-primary"
                      : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes for sell.x</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button onClick={() => void run()} disabled={running}>
            <Radar className="size-4" /> {running ? "Searching…" : "Find candidates"}
          </Button>
          {methodNote && <p className="text-xs text-muted-foreground">Method: {methodNote}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Awaiting approval ({pending?.length ?? 0})</CardTitle>
          <CardDescription>Review evidence on each lead, then approve or reject with a reason.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(pending ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No candidates awaiting approval.</p>
          )}
          {(pending ?? []).map((l) => (
            <Link
              key={l.id}
              to="/leads"
              search={{ lead: l.id }}
              className="block rounded-md border border-border p-3 text-sm hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{l.business_name}</span>
                <span className="text-[11px] text-muted-foreground">{l.city}</span>
              </div>
              {l.disqualify_reason && (
                <p className="text-[11px] text-danger">Flagged: {l.disqualify_reason}</p>
              )}
              {l.notes && <p className="whitespace-pre-wrap text-[11px] text-muted-foreground">{l.notes}</p>}
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent searches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          {(searches ?? []).length === 0 && <p>No searches yet.</p>}
          {(searches ?? []).map((s) => (
            <div key={s.id} className="rounded border border-border px-3 py-2">
              {s.industry} · {s.location} · {s.result_count} candidates ·{" "}
              {new Date(s.created_at).toLocaleString()}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
