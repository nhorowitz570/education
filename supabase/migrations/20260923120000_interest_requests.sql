-- Requests for access from the public site. Written only by the server with
-- the secret key; nobody can read or write them through the public API.
create table public.interest_requests (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or char_length(name) <= 80),
  email text not null unique check (char_length(email) between 3 and 200 and email = lower(email)),
  learn text not null check (char_length(learn) between 1 and 400),
  learns_with text[] not null default '{}' check (cardinality(learns_with) <= 8),
  would_pay text check (would_pay is null or char_length(would_pay) <= 40),
  created_at timestamptz not null default now()
);

alter table public.interest_requests enable row level security;
revoke all on public.interest_requests from anon, authenticated;
grant all on public.interest_requests to service_role;
