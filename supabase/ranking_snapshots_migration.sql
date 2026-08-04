create table if not exists public.ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_type text not null,
  ranking_key text not null,
  rankings jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists ranking_snapshots_type_key_created_idx
on public.ranking_snapshots (snapshot_type, ranking_key, created_at desc);

