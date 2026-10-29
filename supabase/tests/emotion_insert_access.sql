-- Run against an isolated database after applying all migrations, with a role
-- allowed to SET ROLE to anon, authenticated and service_role. Always rolls back.
BEGIN;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.emotions (emotion, lat, lng) VALUES ('joy', 48, 17);
    RAISE EXCEPTION 'anon INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
SELECT emotion, lat, lng, message, created_at FROM public.emotions LIMIT 1;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.emotions (emotion, lat, lng) VALUES ('joy', 48, 17);
    RAISE EXCEPTION 'authenticated INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
SELECT emotion, lat, lng, message, created_at FROM public.emotions LIMIT 1;
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.emotions (emotion, lat, lng, message)
VALUES ('hope', 48.15, 17.11, 'Database access regression check');
RESET ROLE;

ROLLBACK;
