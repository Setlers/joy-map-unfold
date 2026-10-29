BEGIN;

-- Apply the same grid to existing records; keep IDs, times and messages intact.
-- Latitude steps are about 11 km; longitude distance varies with latitude.
UPDATE public.emotions
SET lat = round(lat::numeric, 1)::double precision,
    lng = CASE WHEN round(lng::numeric, 1) = 180 THEN -180
               ELSE round(lng::numeric, 1)::double precision END
WHERE lat IS DISTINCT FROM round(lat::numeric, 1)::double precision
   OR lng IS DISTINCT FROM CASE WHEN round(lng::numeric, 1) = 180 THEN -180
                               ELSE round(lng::numeric, 1)::double precision END;

CREATE OR REPLACE FUNCTION public.emotions_sanitize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Validate before rounding so invalid inputs cannot round into valid bounds.
  IF NEW.lat IS NULL OR NEW.lat NOT BETWEEN -90 AND 90 THEN
    RAISE EXCEPTION 'lat out of range';
  END IF;
  IF NEW.lng IS NULL OR NEW.lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'lng out of range';
  END IF;
  IF NEW.message IS NOT NULL AND char_length(NEW.message) > 120 THEN
    RAISE EXCEPTION 'message too long';
  END IF;

  -- PostgreSQL numeric rounding is symmetric: halfway values round away from 0.
  NEW.lat := round(NEW.lat::numeric, 1)::double precision;
  NEW.lng := round(NEW.lng::numeric, 1)::double precision;
  IF NEW.lng = 180 THEN NEW.lng := -180; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS emotions_sanitize_trg ON public.emotions;
CREATE TRIGGER emotions_sanitize_trg
BEFORE INSERT OR UPDATE OF lat, lng, message ON public.emotions
FOR EACH ROW EXECUTE FUNCTION public.emotions_sanitize();

COMMIT;
