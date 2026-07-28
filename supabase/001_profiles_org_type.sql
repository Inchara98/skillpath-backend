-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- Adds a profiles table that records which organization type each Supabase
-- Auth user belongs to ('government' or 'ngo'), so provider-web and
-- ngo-web can each refuse to sign in an account that belongs to the other
-- app. org_type is intentionally writable only by the service_role key
-- (via scripts/create-partner-user.mjs) -- there is no insert/update/delete
-- policy for the anon/authenticated roles, so a signed-in user can read
-- their own org_type but can never change it via the client SDK.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_type text not null check (org_type in ('government', 'ngo')),
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);
