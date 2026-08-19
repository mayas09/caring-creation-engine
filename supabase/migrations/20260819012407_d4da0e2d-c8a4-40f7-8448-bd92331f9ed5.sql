alter table public.outreach_messages
  add column if not exists provider_message_id text,
  add column if not exists tracking_token uuid not null default gen_random_uuid(),
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_reason text,
  add column if not exists opened_at timestamptz,
  add column if not exists open_count integer not null default 0;

create unique index if not exists outreach_messages_tracking_token_idx on public.outreach_messages(tracking_token);
create index if not exists outreach_messages_provider_message_id_idx on public.outreach_messages(provider_message_id);

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  message_id uuid references public.outreach_messages(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  provider text not null default 'mailgun',
  event text not null,
  label text not null default 'verified',
  detail text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.delivery_events to authenticated;
grant all on public.delivery_events to service_role;
alter table public.delivery_events enable row level security;

drop policy if exists "Users manage their own delivery events" on public.delivery_events;
create policy "Users manage their own delivery events" on public.delivery_events
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists delivery_events_user_idx on public.delivery_events(user_id, occurred_at desc);