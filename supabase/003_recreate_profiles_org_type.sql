-- Recreates what 001_profiles_org_type.sql set up, after 002 dropped it.
-- Run once in the Supabase SQL Editor.

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
