import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — LeadGen AI Pro" },
      {
        name: "description",
        content: "Configure the assistant persona, outreach style, sending limits and compliance defaults.",
      },
      { property: "og:title", content: "Settings — LeadGen AI Pro" },
      { property: "og:description", content: "Assistant persona, outreach style and compliance defaults." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

type Form = {
  assistant_name: string;
  aggressiveness: string;
  email_style: string;
  cta_style: string;
  daily_email_limit: number;
  ghost_threshold_days: number;
  can_spam_signature: string;
  gdpr_tracking: boolean;
  call_recording_default: boolean;
  data_retention_days: number;
  voice_provider: string;
  voice_gender: string;
  voice_accent: string;
};

const DEFAULTS: Form = {
  assistant_name: "sell.x",
  aggressiveness: "balanced",
  email_style: "short",
  cta_style: "soft",
  daily_email_limit: 50,
  ghost_threshold_days: 14,
  can_spam_signature: "",
  gdpr_tracking: false,
  call_recording_default: false,
  data_retention_days: 365,
  voice_provider: "none",
  voice_gender: "neutral",
  voice_accent: "neutral",
};

function SettingsPage() {
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["user_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setForm({
        assistant_name: data.assistant_name,
        aggressiveness: data.aggressiveness,
        email_style: data.email_style,
        cta_style: data.cta_style,
        daily_email_limit: data.daily_email_limit,
        ghost_threshold_days: data.ghost_threshold_days,
        can_spam_signature: data.can_spam_signature,
        gdpr_tracking: data.gdpr_tracking,
        call_recording_default: data.call_recording_default,
      });
    }
  }, [data]);

  async function save() {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSaving(false);
      toast.error("Not signed in");
      return;
    }
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: auth.user.id, ...form }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Settings saved");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Persona and outreach defaults. Compliance settings apply to every generated message.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assistant</CardTitle>
          <CardDescription>How the research partner speaks and pushes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Assistant name">
            <Input
              value={form.assistant_name}
              onChange={(e) => setForm({ ...form, assistant_name: e.target.value })}
            />
          </Field>
          <Field label="Aggressiveness">
            <Select
              value={form.aggressiveness}
              onChange={(v) => setForm({ ...form, aggressiveness: v })}
              options={["gentle", "balanced", "direct"]}
            />
          </Field>
          <Field label="Email style">
            <Select
              value={form.email_style}
              onChange={(v) => setForm({ ...form, email_style: v })}
              options={["short", "medium", "detailed"]}
            />
          </Field>
          <Field label="CTA style">
            <Select
              value={form.cta_style}
              onChange={(v) => setForm({ ...form, cta_style: v })}
              options={["soft", "binary", "direct"]}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limits & compliance</CardTitle>
          <CardDescription>Guardrails that protect deliverability and consent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Daily email limit">
            <Input
              type="number"
              min={1}
              value={form.daily_email_limit}
              onChange={(e) => setForm({ ...form, daily_email_limit: Number(e.target.value) })}
            />
          </Field>
          <Field label="Ghost threshold (days)">
            <Input
              type="number"
              min={1}
              value={form.ghost_threshold_days}
              onChange={(e) => setForm({ ...form, ghost_threshold_days: Number(e.target.value) })}
            />
          </Field>
          <Field label="CAN-SPAM signature">
            <Textarea
              rows={3}
              value={form.can_spam_signature}
              onChange={(e) => setForm({ ...form, can_spam_signature: e.target.value })}
              placeholder="Business name, postal address, unsubscribe line"
            />
          </Field>
          <div className="flex items-center justify-between">
            <Label htmlFor="gdpr">GDPR tracking consent required</Label>
            <Switch
              id="gdpr"
              checked={form.gdpr_tracking}
              onCheckedChange={(v) => setForm({ ...form, gdpr_tracking: v })}
            />
          </div>
          <Field label="Data retention (days)">
            <Input
              type="number"
              min={30}
              value={form.data_retention_days}
              onChange={(e) => setForm({ ...form, data_retention_days: Number(e.target.value) })}
            />
          </Field>
          <div className="flex items-center justify-between">
            <Label htmlFor="rec">Record calls by default</Label>
            <Switch
              id="rec"
              checked={form.call_recording_default}
              onCheckedChange={(v) => setForm({ ...form, call_recording_default: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voice</CardTitle>
          <CardDescription>
            Calls always open with an AI identity disclosure — this cannot be disabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Provider">
            <Select
              value={form.voice_provider}
              onChange={(v) => setForm({ ...form, voice_provider: v })}
              options={["none", "manual", "elevenlabs", "twilio"]}
            />
          </Field>
          <Field label="Voice gender">
            <Select
              value={form.voice_gender}
              onChange={(v) => setForm({ ...form, voice_gender: v })}
              options={["neutral", "female", "male"]}
            />
          </Field>
          <Field label="Accent">
            <Select
              value={form.voice_accent}
              onChange={(v) => setForm({ ...form, voice_accent: v })}
              options={["neutral", "american", "british", "australian"]}
            />
          </Field>
        </CardContent>
      </Card>

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm capitalize"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
