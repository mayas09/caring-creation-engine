ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS default_industry TEXT NOT NULL DEFAULT 'Coffee shops';

ALTER TABLE public.user_settings
  ALTER COLUMN can_spam_signature SET DEFAULT 'Mayas
Asheville, NC
Reply STOP to unsubscribe';
