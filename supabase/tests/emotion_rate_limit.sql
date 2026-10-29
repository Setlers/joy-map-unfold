-- Isolated database only; run after migrations as the migration owner.
BEGIN;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.claim_emotion_submission(repeat('a', 64));
    RAISE EXCEPTION 'anon unexpectedly claimed a slot';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.claim_emotion_submission(repeat('a', 64));
    RAISE EXCEPTION 'authenticated unexpectedly claimed a slot';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  wait_seconds integer;
BEGIN
  IF public.claim_emotion_submission(repeat('a', 64)) <> 0 THEN
    RAISE EXCEPTION 'first submission denied';
  END IF;
  wait_seconds := public.claim_emotion_submission(repeat('a', 64));
  IF wait_seconds NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'repeat submission was not limited';
  END IF;
  IF public.claim_emotion_submission(repeat('b', 64)) <> 0 THEN
    RAISE EXCEPTION 'different client denied';
  END IF;
  BEGIN
    PERFORM public.claim_emotion_submission('not-a-digest');
    RAISE EXCEPTION 'invalid subject accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid rate limit subject' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM subject_hash FROM public.emotion_rate_limits LIMIT 1;
    RAISE EXCEPTION 'service_role can directly read private rate limit data';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

UPDATE public.emotion_rate_limits SET blocked_until = clock_timestamp() - interval '1 second';
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF public.claim_emotion_submission(repeat('a', 64)) <> 0 THEN
    RAISE EXCEPTION 'expired limit did not reset';
  END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT FROM public.emotion_rate_limits WHERE subject_hash = repeat('b', 64)) THEN
    RAISE EXCEPTION 'expired digest was not cleaned up';
  END IF;
END;
$$;

ROLLBACK;
