CREATE OR REPLACE FUNCTION public.emotions_sanitize()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Round to 2 decimal places (~1.1 km) for privacy
  NEW.lat := round(NEW.lat::numeric, 2)::double precision;
  NEW.lng := round(NEW.lng::numeric, 2)::double precision;

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
$function$;