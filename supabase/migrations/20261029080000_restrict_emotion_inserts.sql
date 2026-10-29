-- All submissions must pass through submitEmotion, which applies moderation
-- and uses a server-only service_role client. Public reads and Realtime stay
-- available under the existing SELECT policy.
BEGIN;

DROP POLICY IF EXISTS "Anyone can add an emotion" ON public.emotions;

-- Revoke table and column grants so a direct PostgREST INSERT cannot bypass
-- the server checks, even if another permissive INSERT policy is introduced.
REVOKE INSERT ON TABLE public.emotions FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, emotion, lat, lng, created_at, message)
  ON TABLE public.emotions FROM PUBLIC, anon, authenticated;

GRANT INSERT ON TABLE public.emotions TO service_role;

COMMIT;
