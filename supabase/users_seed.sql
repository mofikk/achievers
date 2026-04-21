-- Step 8: Verify profiles table and seed if needed
-- Run in Supabase SQL editor

select id, email, full_name, role, is_active
from public.profiles
order by created_at nulls last;

-- If table is empty, insert at least two profiles (replace UUID/email values)
insert into public.profiles (id, email, full_name, role, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'super@example.com', 'Super User', 'super_user', true),
  ('00000000-0000-0000-0000-000000000002', 'viewer@example.com', 'Viewer User', 'viewer', true)
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active;
