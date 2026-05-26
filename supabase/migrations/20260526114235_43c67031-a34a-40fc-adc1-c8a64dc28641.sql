-- 1) Trigger to round coords and enforce safe inputs on every insert
CREATE OR REPLACE FUNCTION public.emotions_sanitize()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Round to 1 decimal place (~11 km) for privacy
  NEW.lat := round(NEW.lat::numeric, 1)::double precision;
  NEW.lng := round(NEW.lng::numeric, 1)::double precision;

  IF NEW.lat < -90 OR NEW.lat > 90 THEN
    RAISE EXCEPTION 'lat out of range';
  END IF;
  IF NEW.lng < -180 OR NEW.lng > 180 THEN
    RAISE EXCEPTION 'lng out of range';
  END IF;
  IF NEW.message IS NOT NULL AND char_length(NEW.message) > 120 THEN
    RAISE EXCEPTION 'message too long';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS emotions_sanitize_trg ON public.emotions;
CREATE TRIGGER emotions_sanitize_trg
BEFORE INSERT ON public.emotions
FOR EACH ROW
EXECUTE FUNCTION public.emotions_sanitize();

-- 2) Backfill: round existing coordinates
UPDATE public.emotions
SET lat = round(lat::numeric, 1)::double precision,
    lng = round(lng::numeric, 1)::double precision;

-- 3) Tighten INSERT policy (replace permissive `true`)
DROP POLICY IF EXISTS "Anyone can add an emotion" ON public.emotions;
CREATE POLICY "Anyone can add an emotion"
ON public.emotions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  emotion IS NOT NULL
  AND lat BETWEEN -90 AND 90
  AND lng BETWEEN -180 AND 180
  AND (message IS NULL OR char_length(message) <= 120)
);
