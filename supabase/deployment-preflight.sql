-- Read-only check for the Lovable Cloud SQL runner. This does NOT apply migrations.
-- Results contain schema metadata and counts, not message text or secret values.
BEGIN READ ONLY;

SELECT 'migration_objects' AS check_name,
  to_regclass('public.emotion_rate_limits') IS NOT NULL AS rate_table_exists,
  to_regprocedure('public.claim_emotion_submission(text)') IS NOT NULL AS rate_function_exists;

SELECT 'emotion_access' AS check_name,
  has_table_privilege('anon', 'public.emotions', 'INSERT')
    OR has_any_column_privilege('anon', 'public.emotions', 'INSERT') AS anon_insert_granted,
  has_table_privilege('authenticated', 'public.emotions', 'INSERT')
    OR has_any_column_privilege('authenticated', 'public.emotions', 'INSERT') AS authenticated_insert_granted,
  has_table_privilege('anon', 'public.emotions', 'SELECT') AS anon_read_granted,
  has_table_privilege('service_role', 'public.emotions', 'INSERT') AS server_insert_granted;

SELECT 'coordinate_backfill' AS check_name,
  count(*) AS total_records,
  count(*) FILTER (WHERE
    lat IS DISTINCT FROM round(lat::numeric, 1)::double precision
    OR lng IS DISTINCT FROM CASE WHEN round(lng::numeric, 1) = 180 THEN -180
                                ELSE round(lng::numeric, 1)::double precision END
  ) AS records_to_round,
  count(*) FILTER (WHERE char_length(message) > 120) AS legacy_long_messages
FROM public.emotions;

SELECT 'emotion_trigger' AS check_name, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.emotions'::regclass
  AND tgname = 'emotions_sanitize_trg' AND NOT tgisinternal;

ROLLBACK;
