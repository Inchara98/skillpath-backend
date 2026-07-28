-- Rollback of 001_profiles_org_type.sql. Run once in the Supabase SQL
-- Editor. The government/NGO role-separation approach was abandoned --
-- ngo-web's login page is currently unwired (no auth backend).

drop policy if exists "profiles_select_own" on public.profiles;
drop table if exists public.profiles;
