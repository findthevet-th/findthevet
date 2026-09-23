-- Replace the SECURITY DEFINER view public.public_changelog (flagged by the
-- Supabase security advisor) with an explicit SECURITY DEFINER function.
-- The changelog intentionally shows every user's resolved feedback, so it has
-- to bypass feedback RLS — a function makes that explicit and exposes only
-- the three public columns (never message / user_id / image_url).

-- STEP 1 — run before deploying the code that calls the RPC
create or replace function public.get_public_changelog()
returns table (id uuid, summary text, resolved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.admin_note, coalesce(f.resolved_at, f.created_at)
  from public.feedback f
  where f.status = 'resolved'
    and f.admin_note is not null
    and length(trim(f.admin_note)) > 0
  order by 3 desc
  limit 50
$$;

revoke all on function public.get_public_changelog() from public;
grant execute on function public.get_public_changelog() to anon, authenticated;

-- STEP 2 — run after the new code is live on Vercel
-- drop view if exists public.public_changelog;
