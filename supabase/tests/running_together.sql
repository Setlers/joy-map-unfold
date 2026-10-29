-- Isolated database only. Does not leave test records or expired states behind.
BEGIN;
SET LOCAL ROLE anon;
SELECT id,nickname,lat,lng,started_at,expires_at,ended_at,cheers_count FROM public.training_sessions LIMIT 1;
DO $$ BEGIN
  BEGIN
    PERFORM public.start_training(repeat('a',64),repeat('b',64),48.15,17.15,30,NULL);
    RAISE EXCEPTION 'anon RPC unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM owner_hash FROM public.training_owners;
    RAISE EXCEPTION 'ownership hashes exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.training_sessions(lat,lng,expires_at) VALUES(48,17,now()+interval '30 minutes');
    RAISE EXCEPTION 'anon write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM visitor_hash FROM public.training_cheers;
    RAISE EXCEPTION 'cheer identity exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.end_training(repeat('a',64),gen_random_uuid());
    RAISE EXCEPTION 'authenticated RPC unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE result jsonb; id uuid; other_id uuid;
BEGIN
  result:=public.start_training(repeat('a',64),repeat('b',64),-48.15,179.99,60,'Runner');
  IF NOT (result->>'ok')::boolean THEN RAISE EXCEPTION 'start failed'; END IF;
  id:=(result->'session'->>'id')::uuid;
  IF (result->'session'->>'lat')::float8 <> -48.2 OR (result->'session'->>'lng')::float8 <> -180 THEN RAISE EXCEPTION 'precision mismatch'; END IF;
  IF (result->'session') ? 'owner_hash' THEN RAISE EXCEPTION 'ownership leaked in result'; END IF;
  IF (public.my_training(repeat('a',64))->>'id')::uuid <> id THEN RAISE EXCEPTION 'restore failed'; END IF;
  IF public.my_training(repeat('c',64)) IS NOT NULL THEN RAISE EXCEPTION 'foreign restore succeeded'; END IF;
  IF public.end_training(repeat('c',64),id) THEN RAISE EXCEPTION 'foreign end succeeded'; END IF;
  IF public.start_training(repeat('a',64),repeat('d',64),48,17,30,NULL)->>'code' <> 'active' THEN RAISE EXCEPTION 'duplicate active run'; END IF;
  IF public.cheer_training(repeat('a',64),repeat('d',64),id)->>'code' <> 'own' THEN RAISE EXCEPTION 'self cheer allowed'; END IF;
  result:=public.cheer_training(repeat('c',64),repeat('d',64),id);
  IF NOT (result->>'ok')::boolean OR (result->>'count')::int<>1 THEN RAISE EXCEPTION 'cheer failed'; END IF;
  IF public.cheer_training(repeat('e',64),repeat('d',64),id)->>'code'<>'already' THEN RAISE EXCEPTION 'repeat cheer accepted'; END IF;
  IF NOT public.end_training(repeat('a',64),id) THEN RAISE EXCEPTION 'owner end failed'; END IF;
  IF NOT public.end_training(repeat('a',64),id) THEN RAISE EXCEPTION 'end is not idempotent'; END IF;
  IF public.cheer_training(repeat('c',64),repeat('e',64),id)->>'code'<>'missing' THEN RAISE EXCEPTION 'ended run cheer accepted'; END IF;
  IF public.start_training(repeat('a',64),repeat('f',64),48,17,30,NULL)->>'code'<>'rate' THEN RAISE EXCEPTION 'owner rate bypass'; END IF;
  IF public.start_training(repeat('f',64),repeat('b',64),48,17,30,NULL)->>'code'<>'rate' THEN RAISE EXCEPTION 'IP rate bypass'; END IF;
  result:=public.start_training(repeat('e',64),repeat('f',64),48,17,30,NULL);
  IF NOT (result->>'ok')::boolean THEN RAISE EXCEPTION 'independent runner blocked'; END IF;
END; $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM public.training_sessions WHERE nickname IS NULL) THEN RAISE EXCEPTION 'active runner not readable'; END IF;
END; $$;
RESET ROLE;
-- Both the ended and expired states must disappear from public reads.
UPDATE public.training_sessions SET started_at=now()-interval '1 hour',expires_at=now()-interval '30 minutes'
WHERE id=(public.my_training(repeat('e',64))->>'id')::uuid;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS(SELECT FROM public.training_sessions WHERE nickname='Runner' OR nickname IS NULL) THEN
    RAISE EXCEPTION 'ended or expired training is publicly visible';
  END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename IN('training_owners','training_cheers')) THEN
    RAISE EXCEPTION 'private training data published';
  END IF;
  BEGIN
    PERFORM public.start_training(repeat('a',64),repeat('b',64),48,17,120,NULL);
    RAISE EXCEPTION 'invalid duration allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid training input' THEN RAISE; END IF; END;
END; $$;
ROLLBACK;
