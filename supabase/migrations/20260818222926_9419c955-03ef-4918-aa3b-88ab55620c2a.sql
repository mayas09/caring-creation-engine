-- Enums
CREATE TYPE public.evidence_type AS ENUM ('verified','calculated','inferred','unknown');
CREATE TYPE public.confidence_level AS ENUM ('high','medium','low','none');
CREATE TYPE public.lead_stage AS ENUM ('new','reviewed','contact_drafted','queued','sent','replied','demo_scheduled','proposal_sent','negotiating','closed_won','closed_lost','ghost');
CREATE TYPE public.lead_classification AS ENUM ('opportunity','strong_opportunity','medium_opportunity','low_priority','bad_fit');
CREATE TYPE public.priority_level AS ENUM ('high','medium','low');
CREATE TYPE public.signal_strength AS ENUM ('strong','medium','weak','unknown');
CREATE TYPE public.friction_level AS ENUM ('high','medium','low');
CREATE TYPE public.outreach_channel AS ENUM ('email','sms','call','dm');
CREATE TYPE public.outreach_status AS ENUM ('draft','verified','queued','sent','failed','replied','rejected');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Settings
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  assistant_name TEXT NOT NULL DEFAULT 'sell.x',
  voice_accent TEXT NOT NULL DEFAULT 'american',
  voice_gender TEXT NOT NULL DEFAULT 'male',
  email_style TEXT NOT NULL DEFAULT 'short',
  cta_style TEXT NOT NULL DEFAULT 'soft',
  aggressiveness TEXT NOT NULL DEFAULT 'moderate',
  ghost_threshold_days INTEGER NOT NULL DEFAULT 30,
  daily_email_limit INTEGER NOT NULL DEFAULT 15,
  can_spam_signature TEXT NOT NULL DEFAULT 'Reply STOP to unsubscribe',
  gdpr_tracking BOOLEAN NOT NULL DEFAULT true,
  call_recording_default BOOLEAN NOT NULL DEFAULT false,
  source_policies JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrations JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_settings_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + settings
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  industry TEXT,
  city TEXT,
  country TEXT,
  address TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  contact_name TEXT,
  google_maps_url TEXT,
  instagram TEXT,
  facebook TEXT,
  tiktok TEXT,
  rating NUMERIC(2,1),
  review_count INTEGER,
  locations_count INTEGER DEFAULT 1,
  is_chain BOOLEAN NOT NULL DEFAULT false,
  classification public.lead_classification NOT NULL DEFAULT 'opportunity',
  priority public.priority_level NOT NULL DEFAULT 'medium',
  stage public.lead_stage NOT NULL DEFAULT 'new',
  do_not_contact BOOLEAN NOT NULL DEFAULT false,
  disqualify_reason TEXT,
  why_this_lead JSONB NOT NULL DEFAULT '[]'::jsonb,
  best_angle TEXT,
  notes TEXT,
  rejection_reason TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own leads" ON public.leads FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX leads_user_stage_idx ON public.leads(user_id, stage);

-- Evidence
CREATE TABLE public.evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  evidence_code TEXT NOT NULL,
  claim TEXT NOT NULL,
  type public.evidence_type NOT NULL,
  source TEXT,
  method TEXT,
  confidence public.confidence_level NOT NULL DEFAULT 'medium',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, evidence_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence TO authenticated;
GRANT ALL ON public.evidence TO service_role;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own evidence" ON public.evidence FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX evidence_lead_idx ON public.evidence(lead_id);

-- Signals
CREATE TABLE public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  strength public.signal_strength NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  detail TEXT,
  source TEXT,
  confidence public.confidence_level NOT NULL DEFAULT 'medium',
  note TEXT,
  evidence_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signals TO authenticated;
GRANT ALL ON public.signals TO service_role;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own signals" ON public.signals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX signals_lead_idx ON public.signals(lead_id);

-- Ordering gap
CREATE TABLE public.ordering_gaps (
  lead_id UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  website_found public.evidence_type NOT NULL DEFAULT 'unknown',
  menu_found public.evidence_type NOT NULL DEFAULT 'unknown',
  online_ordering public.evidence_type NOT NULL DEFAULT 'unknown',
  direct_ordering public.evidence_type NOT NULL DEFAULT 'unknown',
  has_website BOOLEAN,
  has_menu BOOLEAN,
  has_online_ordering BOOLEAN,
  has_direct_ordering BOOLEAN,
  third_party_platforms TEXT[] NOT NULL DEFAULT '{}',
  order_button_destination TEXT,
  ordering_type TEXT,
  gap_summary TEXT,
  evidence_codes TEXT[] NOT NULL DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordering_gaps TO authenticated;
GRANT ALL ON public.ordering_gaps TO service_role;
ALTER TABLE public.ordering_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gaps" ON public.ordering_gaps FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER gaps_updated BEFORE UPDATE ON public.ordering_gaps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Friction points
CREATE TABLE public.friction_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  level public.friction_level NOT NULL DEFAULT 'medium',
  point TEXT NOT NULL,
  evidence TEXT,
  source TEXT,
  evidence_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friction_points TO authenticated;
GRANT ALL ON public.friction_points TO service_role;
ALTER TABLE public.friction_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own friction" ON public.friction_points FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX friction_lead_idx ON public.friction_points(lead_id);

-- Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel public.outreach_channel NOT NULL DEFAULT 'email',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own campaigns" ON public.campaigns FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER campaigns_updated BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Outreach messages
CREATE TABLE public.outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  channel public.outreach_channel NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT NOT NULL,
  reasoning JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_codes TEXT[] NOT NULL DEFAULT '{}',
  word_count INTEGER,
  status public.outreach_status NOT NULL DEFAULT 'draft',
  verification JSONB,
  verification_passed BOOLEAN,
  override_logged BOOLEAN NOT NULL DEFAULT false,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_messages TO authenticated;
GRANT ALL ON public.outreach_messages TO service_role;
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.outreach_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER outreach_updated BEFORE UPDATE ON public.outreach_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX outreach_lead_idx ON public.outreach_messages(lead_id);

-- Calls
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  script TEXT,
  accent TEXT,
  recording_enabled BOOLEAN NOT NULL DEFAULT false,
  duration_seconds INTEGER,
  result TEXT,
  transcript TEXT,
  summary JSONB,
  evidence_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own calls" ON public.calls FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Activities
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activities" ON public.activities FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX activities_user_idx ON public.activities(user_id, created_at DESC);

-- AI chat
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chat" ON public.chat_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chat_user_idx ON public.chat_messages(user_id, created_at);