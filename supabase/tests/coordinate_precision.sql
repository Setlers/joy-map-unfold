-- Isolated database only, after all migrations; always rolls back test data.
BEGIN;
DO $$
DECLARE
  actual public.emotions%ROWTYPE;
  test_id uuid;
  input record;
BEGIN
  FOR input IN SELECT * FROM (VALUES
    (48.15::double precision, 17.15::double precision, 48.2::double precision, 17.2::double precision),
    (-48.15, -17.15, -48.2, -17.2),
    (48.149, 17.149, 48.1, 17.1),
    (-48.149, -17.149, -48.1, -17.1),
    (90, 180, 90, -180),
    (-90, -180, -90, -180),
    (0, 179.99, 0, -180)
  ) AS examples(lat, lng, expected_lat, expected_lng)
  LOOP
    INSERT INTO public.emotions (emotion, lat, lng)
      VALUES ('calm', input.lat, input.lng) RETURNING * INTO actual;
    IF actual.lat <> input.expected_lat OR actual.lng <> input.expected_lng THEN
      RAISE EXCEPTION 'unexpected rounded coordinates: %, %', actual.lat, actual.lng;
    END IF;
  END LOOP;

  INSERT INTO public.emotions (emotion, lat, lng) VALUES ('hope', 0, 0) RETURNING id INTO test_id;
  UPDATE public.emotions SET lat = -48.15, lng = 17.15 WHERE id = test_id RETURNING * INTO actual;
  IF actual.lat <> -48.2 OR actual.lng <> 17.2 THEN
    RAISE EXCEPTION 'updates bypass rounding';
  END IF;

  FOR input IN SELECT * FROM (VALUES
    (90.01::double precision, 0::double precision),
    (-90.01, 0), (0, 180.01), (0, -180.01),
    ('NaN'::double precision, 0), (0, 'Infinity'::double precision)
  ) AS invalid(lat, lng)
  LOOP
    BEGIN
      INSERT INTO public.emotions (emotion, lat, lng) VALUES ('calm', input.lat, input.lng);
      RAISE EXCEPTION 'invalid coordinates accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT IN ('lat out of range', 'lng out of range') THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;
ROLLBACK;
