-- SQL editor installation alternative for version 20261029120000.
-- Run ONCE, only after the preflight confirms the three training tables do not exist.
-- Do not also apply the canonical migration separately: this records its version.
-- Canonical source: supabase/migrations/20261029120000_running_together.sql
-- Source SHA-256: 5c3db4c5f55660c3674dd3c670706f4f60026e74ea9057036e189c900cbc9f0f
-- Existing emotions are not rewritten. All DDL and history recording are atomic.

BEGIN;

CREATE TABLE public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text CHECK (nickname IS NULL OR char_length(nickname) BETWEEN 1 AND 30),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng >= -180 AND lng < 180),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  cheers_count integer NOT NULL DEFAULT 0 CHECK (cheers_count >= 0),
  CHECK (expires_at > started_at AND expires_at <= started_at + interval '90 minutes')
);
CREATE INDEX training_sessions_expiry_idx ON public.training_sessions(expires_at);
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_sessions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.training_sessions TO anon, authenticated;
CREATE POLICY "Read active training only" ON public.training_sessions FOR SELECT TO anon, authenticated
  USING (ended_at IS NULL AND expires_at > now());

CREATE TABLE public.training_owners (
  owner_hash text PRIMARY KEY CHECK (owner_hash ~ '^[0-9a-f]{64}$'),
  session_id uuid UNIQUE REFERENCES public.training_sessions(id) ON DELETE SET NULL,
  last_started_at timestamptz NOT NULL DEFAULT '-infinity'::timestamptz
);
CREATE TABLE public.training_cheers (
  session_id uuid REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  visitor_hash text CHECK (visitor_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(session_id, visitor_hash)
);
ALTER TABLE public.training_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_cheers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_owners, public.training_cheers FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.training_coordinates_sanitize() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.lat IS NULL OR NEW.lat NOT BETWEEN -90 AND 90 OR NEW.lng IS NULL OR NEW.lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid coordinates';
  END IF;
  NEW.lat := round(NEW.lat::numeric, 1)::double precision;
  NEW.lng := round(NEW.lng::numeric, 1)::double precision;
  IF NEW.lng = 180 THEN NEW.lng := -180; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER training_coordinates_sanitize BEFORE INSERT OR UPDATE OF lat, lng ON public.training_sessions
FOR EACH ROW EXECUTE FUNCTION public.training_coordinates_sanitize();

CREATE FUNCTION public.start_training(p_owner_hash text, p_subject_hash text, p_lat double precision,
  p_lng double precision, p_minutes integer, p_nickname text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  owner public.training_owners%ROWTYPE;
  session public.training_sessions%ROWTYPE;
  wait_seconds integer;
  current_ts timestamptz := clock_timestamp();
BEGIN
  IF p_owner_hash IS NULL OR p_owner_hash !~ '^[0-9a-f]{64}$'
    OR p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$'
    OR p_minutes IS NULL OR p_minutes NOT IN (30,60,90)
    OR (p_nickname IS NOT NULL AND char_length(p_nickname) NOT BETWEEN 1 AND 30) THEN
    RAISE EXCEPTION 'invalid training input';
  END IF;
  -- Expiry hides states immediately; physical cleanup happens on future starts.
  DELETE FROM public.training_sessions WHERE expires_at < current_ts - interval '24 hours';
  DELETE FROM public.training_owners WHERE session_id IS NULL AND last_started_at < current_ts - interval '24 hours';
  INSERT INTO public.training_owners(owner_hash) VALUES (p_owner_hash) ON CONFLICT DO NOTHING;
  SELECT * INTO owner FROM public.training_owners WHERE owner_hash = p_owner_hash FOR UPDATE;
  IF EXISTS (SELECT FROM public.training_sessions WHERE id = owner.session_id AND ended_at IS NULL AND expires_at > current_ts) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'active');
  END IF;
  IF owner.last_started_at > current_ts - interval '1 minute' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate', 'wait', greatest(1, ceil(extract(epoch FROM owner.last_started_at + interval '1 minute' - current_ts)))::integer);
  END IF;
  wait_seconds := public.claim_emotion_submission(p_subject_hash);
  IF wait_seconds > 0 THEN RETURN jsonb_build_object('ok', false, 'code', 'rate', 'wait', wait_seconds); END IF;
  INSERT INTO public.training_sessions(nickname, lat, lng, started_at, expires_at)
  VALUES (p_nickname, p_lat, p_lng, current_ts, current_ts + make_interval(mins => p_minutes)) RETURNING * INTO session;
  UPDATE public.training_owners SET session_id = session.id, last_started_at = current_ts WHERE owner_hash = p_owner_hash;
  RETURN jsonb_build_object('ok', true, 'session', to_jsonb(session));
END;
$$;

CREATE FUNCTION public.my_training(p_owner_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT to_jsonb(s) FROM public.training_sessions s JOIN public.training_owners o ON o.session_id = s.id WHERE o.owner_hash = p_owner_hash;
$$;
CREATE FUNCTION public.end_training(p_owner_hash text, p_session_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.training_sessions SET ended_at = coalesce(ended_at, clock_timestamp())
  WHERE id = p_session_id
    AND EXISTS (SELECT FROM public.training_owners WHERE owner_hash = p_owner_hash AND session_id = p_session_id);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;
CREATE FUNCTION public.cheer_training(p_owner_hash text, p_subject_hash text, p_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE session public.training_sessions%ROWTYPE; changed integer;
BEGIN
  IF p_owner_hash IS NULL OR p_owner_hash !~ '^[0-9a-f]{64}$' OR p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid cheer input';
  END IF;
  SELECT * INTO session FROM public.training_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR session.ended_at IS NOT NULL OR session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'missing');
  END IF;
  IF EXISTS (SELECT FROM public.training_owners WHERE owner_hash = p_owner_hash AND session_id = p_session_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'own');
  END IF;
  INSERT INTO public.training_cheers(session_id, visitor_hash) VALUES (p_session_id, p_subject_hash) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 0 THEN RETURN jsonb_build_object('ok', false, 'code', 'already'); END IF;
  UPDATE public.training_sessions SET cheers_count = cheers_count + 1 WHERE id = p_session_id RETURNING * INTO session;
  RETURN jsonb_build_object('ok', true, 'count', session.cheers_count);
END;
$$;

REVOKE ALL ON FUNCTION public.start_training(text,text,double precision,double precision,integer,text),
  public.my_training(text), public.end_training(text,uuid), public.cheer_training(text,text,uuid), public.training_coordinates_sanitize()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_training(text,text,double precision,double precision,integer,text),
  public.my_training(text), public.end_training(text,uuid), public.cheer_training(text,text,uuid) TO service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE public.training_sessions;

-- Record the already executed version in this same transaction.
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20261029120000');

NOTIFY pgrst, 'reload schema';

SELECT
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '20261029120000') AS migration_recorded,
  has_table_privilege('anon', 'public.training_sessions', 'SELECT') AS public_read,
  NOT (has_table_privilege('anon', 'public.training_sessions', 'INSERT')
       OR has_table_privilege('authenticated', 'public.training_sessions', 'INSERT')) AS public_write_blocked,
  NOT (has_table_privilege('anon', 'public.training_owners', 'SELECT')
       OR has_table_privilege('authenticated', 'public.training_owners', 'SELECT')
       OR has_table_privilege('anon', 'public.training_cheers', 'SELECT')
       OR has_table_privilege('authenticated', 'public.training_cheers', 'SELECT')) AS private_data_hidden,
  has_function_privilege('service_role',
    'public.start_training(text,text,double precision,double precision,integer,text)',
    'EXECUTE') AS server_start_allowed,
  (SELECT bool_and(relrowsecurity) FROM pg_class
   WHERE oid IN ('public.training_sessions'::regclass,
                 'public.training_owners'::regclass,
                 'public.training_cheers'::regclass)) AS rls_enabled;

COMMIT;
