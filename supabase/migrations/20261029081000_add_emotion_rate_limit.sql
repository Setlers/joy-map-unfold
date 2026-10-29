BEGIN;

-- Separate from public emotions: never expose network identifiers to readers
-- or to the Realtime publication. Store only a digest, never the raw IP.
CREATE TABLE public.emotion_rate_limits (
  subject_hash text PRIMARY KEY CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  blocked_until timestamptz NOT NULL
);
CREATE INDEX emotion_rate_limits_expiry_idx
  ON public.emotion_rate_limits (blocked_until);
ALTER TABLE public.emotion_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.emotion_rate_limits FROM PUBLIC, anon, authenticated, service_role;

-- The row's unique key serializes competing requests across server instances.
-- Consume a slot before writing: a failed save may require waiting one minute.
CREATE FUNCTION public.claim_emotion_submission(p_subject_hash text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_until timestamptz;
  current_time_ts timestamptz := clock_timestamp();
BEGIN
  IF p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid rate limit subject';
  END IF;

  -- Opportunistic cleanup; no permanent IP digest history is needed.
  DELETE FROM public.emotion_rate_limits WHERE blocked_until <= current_time_ts;

  INSERT INTO public.emotion_rate_limits AS limits (subject_hash, blocked_until)
  VALUES (p_subject_hash, current_time_ts + interval '1 minute')
  ON CONFLICT (subject_hash) DO UPDATE
    SET blocked_until = EXCLUDED.blocked_until
    WHERE limits.blocked_until <= current_time_ts
  RETURNING blocked_until INTO claimed_until;

  IF claimed_until IS NOT NULL THEN
    RETURN 0;
  END IF;

  SELECT blocked_until INTO claimed_until
    FROM public.emotion_rate_limits WHERE subject_hash = p_subject_hash;
  RETURN greatest(1, ceil(extract(epoch FROM (claimed_until - current_time_ts)))::integer);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_emotion_submission(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_emotion_submission(text) TO service_role;

COMMIT;
