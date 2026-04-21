-- Profiles table RLS support (non-recursive)
-- Run in Supabase SQL editor.

begin;

alter table if exists public.profiles enable row level security;

-- Helper avoids recursive self-query in policies.
create or replace function public.is_super_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_user'
      and p.is_active = true
  );
$$;

revoke all on function public.is_super_user() from public;
grant execute on function public.is_super_user() to authenticated;

-- Drop known/legacy policies that can cause recursion.
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_super_user" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_super_user" on public.profiles;

create policy "profiles_select_own_or_super_user"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or public.is_super_user()
);

create policy "profiles_update_own_or_super_user"
on public.profiles
for update
to authenticated
using (
  auth.uid() = id
  or public.is_super_user()
)
with check (
  auth.uid() = id
  or public.is_super_user()
);

commit;
