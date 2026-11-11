-- updated_at maintenance is trigger-only; no Data API role needs RPC access.
REVOKE ALL ON FUNCTION public.update_updated_at_column()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.update_updated_at_column() IS
  'Internal updated_at trigger function. Direct RPC execution is revoked and search_path is restricted to pg_catalog.';
