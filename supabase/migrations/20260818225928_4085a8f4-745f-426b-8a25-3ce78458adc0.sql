-- discovery searches
CREATE TABLE public.discovery_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  industry TEXT NOT NULL,
  location TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_searches TO authenticated;
GRANT ALL ON public.discovery_searches TO service_role;
ALTER TABLE public.discovery_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own discovery searches" ON public.discovery_searches FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- do-not-contact list
CREATE TABLE public.dnc_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  value TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'email',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dnc_entries TO authenticated;
GRANT ALL ON public.dnc_entries TO service_role;
ALTER TABLE public.dnc_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dnc entries" ON public.dnc_entries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- lead approval + discovery provenance
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discovery_search_id UUID REFERENCES public.discovery_searches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS bump_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ghosted_at TIMESTAMPTZ;

-- outreach sequencing
ALTER TABLE public.outreach_messages
  ADD COLUMN IF NOT EXISTS step_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_bump BOOLEAN NOT NULL DEFAULT false;

-- settings extras
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS data_retention_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS voice_provider TEXT NOT NULL DEFAULT 'elevenlabs';