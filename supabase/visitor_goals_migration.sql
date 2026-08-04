alter table public.visitor_stats
add column if not exists goals integer not null default 0;

update public.visitor_stats
set goals = 0
where goals is null;
