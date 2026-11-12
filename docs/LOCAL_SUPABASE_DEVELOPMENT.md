# Local Supabase development

SOET Connect now has a committed Supabase CLI configuration and a reproducible local migration check. This uses the free local Supabase stack; it does not require another hosted Supabase project or Production credentials.

## Requirements on Windows

1. Install and start Docker Desktop with the WSL 2 backend enabled.
2. Use Node.js 20 or later if running the CLI through `npx` (the project currently uses Node.js 24).
3. From the repository root, run the commands below in PowerShell.

You can install the CLI with Scoop, or run the pinned CLI version through `npx` without installing it globally:

```powershell
npx --yes supabase@3.0.0 --version
npx --yes supabase@3.0.0 start
npx --yes supabase@3.0.0 status
```

The first start downloads the local service images and can take several minutes. Supabase Studio is local; the local database URL and generated keys are shown by `status`.

## Replaying migrations

The local stack applies the repository migrations when it starts. To intentionally discard and rebuild the **local** database later, run:

```powershell
npx --yes supabase@3.0.0 db reset --local
```

`db reset` is destructive to the selected local database. It is safe here only because this repository is not linked to Production and the CLI v3 default target is local. Do not add `supabase link`, `--remote`, a hosted database URL, or Production credentials to this local workflow.

Stop the local services when finished:

```powershell
npx --yes supabase@3.0.0 stop
```

## Connecting the FastAPI backend locally

Use the local Project URL and local service-role/secret key printed by `supabase status` in an untracked local environment file. Map them to the variable names expected by the backend:

- `SUPABASE_URL` = local Project URL (normally `http://127.0.0.1:54321`)
- `SUPABASE_SERVICE_ROLE_KEY` = local service-role key, if provided by the installed CLI version
- `DATABASE_MODE` = the backend's real Supabase mode, not Preview mock mode

Keep these values local. Never copy Production Supabase keys into a local `.env` file or commit generated credentials. Local email is captured by the local Mailpit service; it is not sent to real recipients.

## Continuous integration

The `Local Supabase migration replay` GitHub Actions job starts a fresh local stack and verifies the migration history on changes to `supabase/**`. It receives no Supabase login token, hosted project reference, or Production secret. A migration that cannot replay from an empty database fails the job.

The local config uses PostgreSQL 17 to match the hosted Production database major version. The `project_id` value is only a local CLI/container identity; it is not the Production project reference.
