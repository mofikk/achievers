-- Role + permissions migration for Achievers app
-- Safe to run multiple times.

begin;

-- 1) Add super_admin to the enum used by profiles.role (if enum-backed)
do $$
declare
  enum_type_name text;
begin
  select t.typname
    into enum_type_name
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  where n.nspname = 'public'
    and c.relname = 'profiles'
    and a.attname = 'role'
    and t.typtype = 'e'
  limit 1;

  if enum_type_name is not null then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = enum_type_name
        and e.enumlabel = 'super_admin'
    ) then
      execute format('alter type public.%I add value %L', enum_type_name, 'super_admin');
    end if;
  end if;
end $$;

-- 2) Create role_permissions override table
create table if not exists public.role_permissions (
  role text primary key,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_permissions_role_check
    check (role in ('viewer', 'admin', 'super_admin', 'super_user'))
);

create index if not exists role_permissions_role_idx on public.role_permissions (role);

-- Keep updated_at fresh
create or replace function public.set_role_permissions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_role_permissions_updated_at on public.role_permissions;
create trigger trg_role_permissions_updated_at
before update on public.role_permissions
for each row execute function public.set_role_permissions_updated_at();

-- 3) Seed default overrides (app also has hard defaults; this keeps DB explicit)
insert into public.role_permissions (role, permissions)
values
  (
    'viewer',
    '{
      "view_activity": true,
      "view_reports": false,
      "manage_players_create": false,
      "manage_players_update": false,
      "manage_players_delete": false,
      "manage_attendance": false,
      "manage_visitors": false,
      "manage_stats": false,
      "manage_fines": false,
      "manage_payments": false,
      "manage_notes": false,
      "manage_settings": false,
      "manage_users": false
    }'::jsonb
  ),
  (
    'admin',
    '{
      "view_activity": true,
      "view_reports": false,
      "manage_players_create": true,
      "manage_players_update": true,
      "manage_players_delete": false,
      "manage_attendance": true,
      "manage_visitors": true,
      "manage_stats": false,
      "manage_fines": false,
      "manage_payments": false,
      "manage_notes": true,
      "manage_settings": false,
      "manage_users": false
    }'::jsonb
  ),
  (
    'super_admin',
    '{
      "view_activity": true,
      "view_reports": false,
      "manage_players_create": true,
      "manage_players_update": true,
      "manage_players_delete": true,
      "manage_attendance": true,
      "manage_visitors": true,
      "manage_stats": true,
      "manage_fines": true,
      "manage_payments": true,
      "manage_notes": true,
      "manage_settings": false,
      "manage_users": false
    }'::jsonb
  ),
  (
    'super_user',
    '{
      "view_activity": true,
      "view_reports": true,
      "manage_players_create": true,
      "manage_players_update": true,
      "manage_players_delete": true,
      "manage_attendance": true,
      "manage_visitors": true,
      "manage_stats": true,
      "manage_fines": true,
      "manage_payments": true,
      "manage_notes": true,
      "manage_settings": true,
      "manage_users": true
    }'::jsonb
  )
on conflict (role)
do update set
  permissions = excluded.permissions,
  updated_at = now();

-- 4) RLS for role_permissions
alter table public.role_permissions enable row level security;

-- remove old variants if they exist
drop policy if exists role_permissions_select_super_user on public.role_permissions;
drop policy if exists role_permissions_insert_super_user on public.role_permissions;
drop policy if exists role_permissions_update_super_user on public.role_permissions;
drop policy if exists role_permissions_delete_super_user on public.role_permissions;

create policy role_permissions_select_super_user
on public.role_permissions
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_user'
      and p.is_active = true
  )
);

create policy role_permissions_insert_super_user
on public.role_permissions
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_user'
      and p.is_active = true
  )
);

create policy role_permissions_update_super_user
on public.role_permissions
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_user'
      and p.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_user'
      and p.is_active = true
  )
);

create policy role_permissions_delete_super_user
on public.role_permissions
for delete
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_user'
      and p.is_active = true
  )
);

-- 5) grants
grant select, insert, update, delete on table public.role_permissions to authenticated;

commit;
