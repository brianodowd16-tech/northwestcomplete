-- Row-level tenancy. The app connects as the owner and, for every tenant-scoped
-- request, runs `SET LOCAL ROLE round_app` plus `set_config('app.tenant_id', ...)`
-- inside a transaction (see withTenant in src/index.ts). round_app is not the
-- table owner, so these policies always apply to it.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'round_app') THEN
    CREATE ROLE round_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO round_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO round_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO round_app;

CREATE OR REPLACE FUNCTION current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'programme','programme_level','venue','venue_table','staff_user','menu_category','menu_item',
    'membership','loyalty_ledger','orders','order_line','docket','subscription','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
  END LOOP;
END $$;
