# Preview Environment Isolation

**Updated:** 2026-11-12  
**Vercel project:** `soet-connect`  
**Production database:** Existing SOET Connect Supabase project (unchanged)

## Objective

Vercel Preview deployments must not read or write the production Supabase database, use production JWT signing material, or send real production notifications. This isolation uses the existing free hosting allowance and does not create another hosted Supabase project.

## Environment configuration

### Production-only variables

The following production credentials/provider settings are targeted only to Vercel Production:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET_KEY`
- `ADMIN_REGISTRATION_SECRET`
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL`
- Production Twilio account credentials and webhook signing secret

The existing Production values were not rotated or changed during this isolation task; only deployment targets were adjusted.

### Preview-only variables

- `DATABASE_MODE=mock`: routes database table operations and Storage calls through the backend's in-memory mock adapters.
- `JWT_SECRET_KEY`: a new, independent Preview-only random secret.
- `ADMIN_REGISTRATION_SECRET`: a new, independent Preview-only random secret.
- `ENVIRONMENT=preview`: makes the backend health response report the correct environment.
- Preview Twilio environment variable values were cleared so Preview cannot use an SMS provider account.

No Production Supabase URL or service-role credential is configured for new Preview deployments. No Resend or SMTP credentials are configured for Preview.

## Mock-mode limitations

Mock mode is an isolation safeguard, not a hosted staging database:

- Data is held in memory and is not durable across serverless instances, cold starts, or redeployments.
- It is suitable for route rendering, API contract checks, and carefully scoped single-instance mock tests.
- It cannot establish reliable cross-instance login/session persistence or real PostgreSQL/RLS/Storage behavior.
- RPC calls are intentionally unavailable in mock mode.
- A health response that reports `database: connected` in mock mode means the mock adapter is available; it does not mean a remote database connection was made.

Do not report mock-mode browser checks as real authenticated database acceptance tests.

## Test strategy without paid services

1. Use Vercel Preview with mock mode for public route, UI, role-layout, and non-persistent API checks.
2. Use the free local Supabase CLI stack with the repository migrations when real Postgres, Auth, RLS, Storage, and persistent signed-cookie flows need to be tested.
3. Keep the existing hosted Supabase project exclusively for Production.
4. Do not enable enforced Content-Security-Policy in Production until real authentication and representative data-access testing has passed.

## Deployment note

Vercel environment-variable changes apply to subsequent deployments; existing deployments can retain the environment snapshot used when they were created. A fresh Preview deployment must be created and inspected before considering this isolation validated. Preview deployments remain covered by the project's Vercel SSO protection; the custom Production domain is excluded from that protection.

## Verification checklist for the first fresh Preview deployment

- [ ] Confirm Preview `/api/health` reports `environment: preview`.
- [ ] Confirm the Preview backend is configured with `DATABASE_MODE=mock`.
- [ ] Confirm registration/login routes do not contact the Production Supabase project.
- [ ] Confirm Preview does not send email or SMS through Production providers.
- [ ] Re-run public-route and role-layout CSP checks.
- [ ] Record any limitations caused by per-instance in-memory state.
