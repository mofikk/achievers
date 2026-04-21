-- Weekly committed text summary for a Saturday session.
-- Run this in Supabase SQL editor.

create table if not exists public.session_summaries (
  id uuid primary key default gen_random_uuid(),
  session_date date not null unique,
  raw_text text not null,
  review_json jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_session_summaries_session_date
  on public.session_summaries(session_date desc);

alter table public.session_summaries enable row level security;

drop policy if exists session_summaries_select_authenticated on public.session_summaries;
create policy session_summaries_select_authenticated
on public.session_summaries
for select
using (auth.role() = 'authenticated');

drop policy if exists session_summaries_insert_authenticated on public.session_summaries;
create policy session_summaries_insert_authenticated
on public.session_summaries
for insert
with check (auth.role() = 'authenticated');
