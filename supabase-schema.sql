create table if not exists public.campaign_margins (
  campaign_key text primary key,
  client text not null default '',
  client_cpl numeric not null default 0,
  validated_leads integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.campaign_margins enable row level security;

drop policy if exists "Service role can manage campaign margins" on public.campaign_margins;

create policy "Service role can manage campaign margins"
on public.campaign_margins
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
