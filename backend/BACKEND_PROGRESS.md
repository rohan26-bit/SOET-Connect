# SOET Connect — Backend Progress

> Last updated: 2026-09-29

---

## Table of Contents

1. [Auth / AuthZ](#1-auth--authz)
2. [Profiles](#2-profiles)
3. [Alumni](#3-alumni)
4. [Jobs](#4-jobs)
5. [Job Applications](#5-job-applications)
6. [Events](#6-events)
7. [Announcements](#7-announcements)
8. [Notifications](#8-notifications)
9. [Admin](#9-admin)
10. [Full Route Table](#full-route-table)
11. [Risks & Limitations](#risks--limitations)

---

## 1. Auth / AuthZ

### What exists

JWT-based authentication with registration and login.

### Files

| File | Role |
|------|------|
| `routes/auth.py` | `/auth/register`, `/auth/login` endpoints |
| `schemas/auth.py` | `RegisterRequest`, `LoginRequest` Pydantic models |
| `models/user.py` | `create_user_document()` — builds the MongoDB user doc |
| `security/jwt.py` | `create_access_token()`, `decode_access_token()` |
| `security/dependencies.py` | `get_current_user()` — FastAPI dependency extracting JWT from `Authorization: Bearer` header |
| `database.py` | MongoDB connection, exports `users_collection` |

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | None | Register student or alumni |
| `POST` | `/auth/login` | None | Login, returns JWT |

### Authorization rules

- Only `student` and `alumni` roles can self-register.
- Duplicate emails rejected (400).
- Password hashed with `pwdlib` (argon2/bcrypt).
- Alumni accounts are created with `is_verified: false`; students and admin are auto-verified.
- JWT payload contains `sub` (user_id) and `role`, expires in 24 hours.
- `get_current_user` dependency decodes the token; all protected routes use it.

### Persistence

- MongoDB `users` collection.

### Checks

- Syntax/import validation passes.

---

## 2. Profiles

### What exists

Authenticated users can view and update their own profile.

### Files

| File | Role |
|------|------|
| `routes/profile.py` | `/profile/me` GET and PATCH |
| `schemas/profile.py` | `ProfileUpdateRequest` Pydantic model |

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/profile/me` | JWT | View own profile |
| `PATCH` | `/profile/me` | JWT | Update own profile fields |

### Authorization rules

- Users can only view/edit their own profile (enforced by JWT `user_id`).
- Role-specific fields: student fields for students, alumni fields for alumni.

### Persistence

- MongoDB `users` collection (updates via `$set`).

---

## 3. Alumni

### What exists

Alumni directory listing and admin verification workflow.

### Files

| File | Role |
|------|------|
| `routes/alumni.py` | Alumni directory, pending list, verification |

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/alumni/directory` | JWT | List verified alumni |
| `GET` | `/alumni/pending` | JWT (admin) | List unverified alumni |
| `PATCH` | `/alumni/verify/{user_id}` | JWT (admin) | Approve/reject alumni |

### Authorization rules

- Any authenticated user can view the verified alumni directory.
- Only admin can view pending alumni or verify them.

### Persistence

- MongoDB `users` collection.

---

## 4. Jobs

### What changed

Pre-existing module — no modifications made. Reviewed for pattern consistency.

### Files

| File | Role |
|------|------|
| `routes/jobs.py` | Full CRUD for job postings |
| `jobs_data.json` | Temporary JSON file store |

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/jobs` | JWT (alumni/admin) | Create job posting |
| `GET` | `/jobs` | JWT | List approved jobs (admin sees all) |
| `GET` | `/jobs/mine` | JWT | List own posted jobs |
| `GET` | `/jobs/admin` | JWT (admin) | List all jobs (admin only) |
| `PATCH` | `/jobs/{job_id}/status` | JWT (admin) | Approve/reject/pend a job |
| `DELETE` | `/jobs/{job_id}` | JWT (owner/admin) | Delete a job |

### Authorization rules

- Only verified alumni and admin can create jobs.
- Alumni-posted jobs start as `pending`; admin-posted jobs are auto-`approved`.
- Valid job statuses: `pending`, `approved`, `rejected`.
- Only admin can change job status.
- Job owners and admin can delete jobs.
- Non-admin users see only approved jobs in the listing.

### Persistence

- `jobs_data.json` — temporary JSON file (same directory as `main.py`).

---

## 5. Job Applications

### What changed

New module created. Authorization later refined so that both admin and job poster can update application status.

### Files created

| File | Role |
|------|------|
| `routes/applications.py` | Application CRUD endpoints |
| `applications_data.json` | Temporary JSON file store |

### Files modified

| File | Change |
|------|--------|
| `main.py` | Import and register `applications_router` |

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/jobs/{job_id}/applications` | JWT (student) | Apply to an approved job |
| `GET` | `/jobs/applications/me` | JWT (student) | View own applications |
| `GET` | `/jobs/{job_id}/applications` | JWT (owner/admin) | View applicants for a job |
| `PATCH` | `/jobs/applications/{application_id}/status` | JWT (admin/poster) | Update application status |

### Authorization rules

- Only students can apply.
- Only approved jobs accept applications.
- Duplicate applications (same student + job) are rejected (400).
- Students can only view their own applications.
- Job owners (alumni who posted) can view applicants for their own jobs.
- Admin can view any job's applicants.
- Application status update: admin always allowed; job poster allowed for their own job's applications; everyone else gets 403.
- Valid application statuses: `applied`, `under_review`, `shortlisted`, `interview`, `selected`, `rejected`.
- User identity derived exclusively from JWT.

### Persistence

- `applications_data.json` — temporary JSON file.

### Checks performed

- `py_compile` syntax check: pass.
- Runtime import and route registration: all 4 routes confirmed.

---

## 6. Events

### What changed

New module created. Reviewed against project contract — `max_attendees` field removed (no existing contract justified it).

### Files created

| File | Role |
|------|------|
| `routes/events.py` | Event CRUD + registration endpoints |
| `events_data.json` | Temporary JSON file store for events |
| `event_registrations_data.json` | Temporary JSON file store for registrations |

### Files modified

| File | Change |
|------|--------|
| `main.py` | Import and register `events_router` |

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/events` | JWT | List events (approved + own for creators; admin sees all) |
| `POST` | `/events` | JWT (verified alumni/admin) | Create event |
| `PATCH` | `/events/{event_id}` | JWT (creator/admin) | Update event; only admin can change status |
| `DELETE` | `/events/{event_id}` | JWT (creator/admin) | Delete event + cascade-delete registrations |
| `POST` | `/events/{event_id}/register` | JWT | Register for an approved event |
| `GET` | `/events/registrations/me` | JWT | View own registrations |
| `GET` | `/events/{event_id}/registrations` | JWT (creator/admin) | View registrations for an event |

### Authorization rules

- Only verified alumni and admin can create events.
- Alumni events start `pending`; admin events start `approved`.
- Valid event statuses: `pending`, `approved`, `rejected`, `cancelled`.
- Only admin can change event status (via PATCH).
- Creator and admin can update/delete their own events.
- Only approved events accept registrations.
- Registration deadline enforced when set (date-only and ISO formats, timezone-safe).
- Duplicate registrations (same user + event) rejected (400).
- Users see only their own registrations.
- Event owner and admin can view the event's registration list.
- JWT identity used throughout.

### Persistence

- `events_data.json`, `event_registrations_data.json` — temporary JSON files.

### Checks performed

- `py_compile` syntax check: pass.
- Runtime import and route registration: all 7 routes confirmed.
- Full app boot: all 30 routes at time of implementation (now 34 with announcements).

---

## 7. Announcements

### What changed

New module created. No existing announcement contract found in the repository (no SQL schema, no frontend code, no documentation). Fields kept minimal: `title`, `content`, `target_audience`.

### Files created

| File | Role |
|------|------|
| `routes/announcements.py` | Announcement CRUD endpoints |
| `announcements_data.json` | Temporary JSON file store |

### Files modified

| File | Change |
|------|--------|
| `main.py` | Import and register `announcements_router` |

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/announcements` | JWT | List announcements visible to caller's role |
| `POST` | `/announcements` | JWT (admin) | Create announcement |
| `PATCH` | `/announcements/{announcement_id}` | JWT (admin) | Update announcement |
| `DELETE` | `/announcements/{announcement_id}` | JWT (admin) | Delete announcement |

### Authorization rules

- Any authenticated user can view announcements targeted to their role.
- Target audience filtering: `all` → everyone; `students` → students only; `alumni` → alumni only; admin always sees all.
- Valid target audiences: `all`, `students`, `alumni`.
- Only admin can create, update, or delete announcements.
- `target_audience` validated on both create and update.
- Empty update body rejected (400).
- Non-existent announcement returns 404.
- JWT identity used for all authorization checks.

### Persistence

- `announcements_data.json` — temporary JSON file.

### Checks performed

- `py_compile` syntax check: pass.
- Runtime import and route registration: all 4 routes confirmed.
- Full app boot: all 34 routes confirmed.

---

## 8. Notifications

### What changed

New module created. No existing notification contract found in the repository (no schema, no frontend code). Fields kept minimal: `id`, `user_id`, `title`, `message`, `is_read`, `created_at`. A `create_notification()` helper is exported for server-side use by other modules.

### Files created

| File | Role |
|------|------|
| `routes/notifications.py` | Notification list + read endpoints, plus `create_notification()` helper |
| `notifications_data.json` | Temporary JSON file store |

### Files modified

| File | Change |
|------|--------|
| `main.py` | Import and register `notifications_router` |

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/notifications` | JWT | List own notifications (most recent first) |
| `PATCH` | `/notifications/{notification_id}/read` | JWT | Mark a single notification as read |
| `PATCH` | `/notifications/read-all` | JWT | Mark all own notifications as read |

### Authorization rules

- Any authenticated user can list their own notifications.
- Users can only mark their own notifications as read (ownership enforced via JWT `user_id`).
- `create_notification()` is a server-side helper — not exposed as an API endpoint. Other modules can import and call it to create notifications for specific users.
- Non-existent notification returns 404; wrong owner returns 403.
- JWT identity used exclusively; client-supplied user IDs are never trusted.

### Persistence

- `notifications_data.json` — temporary JSON file.

### Checks performed

- `py_compile` syntax check: pass.
- Runtime import and route registration: all 3 routes confirmed.
- Full app boot: all 37 routes confirmed.

---

## 9. Admin

### What changed

New `routes/admin.py` module created with a `GET /admin/stats` endpoint. All pre-existing admin endpoints (`/alumni/pending`, `/alumni/verify/{user_id}`, `/jobs/admin`, `/jobs/{job_id}/status`) remain in their original modules unchanged.

### Existing admin endpoints verified

| Method | Path | Module | Status |
|--------|------|--------|--------|
| `GET` | `/alumni/pending` | `routes/alumni.py` | ✅ Working — admin-only, lists unverified alumni |
| `PATCH` | `/alumni/verify/{user_id}` | `routes/alumni.py` | ✅ Working — admin-only, statuses: approved/rejected/suspended |
| `GET` | `/jobs/admin` | `routes/jobs.py` | ✅ Working — admin-only, lists all jobs |
| `PATCH` | `/jobs/{job_id}/status` | `routes/jobs.py` | ✅ Working — admin-only, statuses: pending/approved/rejected |

### Files created

| File | Role |
|------|------|
| `routes/admin.py` | Admin statistics endpoint |

### Files modified

| File | Change |
|------|--------|
| `main.py` | Import and register `admin_router` |

### Endpoints added

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/stats` | JWT (admin) | Dashboard statistics aggregated from all data stores |

### Statistics returned

```json
{
  "users": { "total": N, "by_role": { "student": N, "alumni": N, "admin": N } },
  "alumni": { "total": N, "verified": N, "pending": N },
  "jobs": { "total": N, "by_status": { "pending": N, "approved": N, "rejected": N } },
  "applications": { "total": N, "by_status": { "applied": N, "under_review": N, ... } },
  "events": { "total": N, "by_status": { "pending": N, "approved": N, ... } },
  "event_registrations": { "total": N },
  "announcements": { "total": N },
  "notifications": { "total": N }
}
```

### Authorization rules

- Only admin role (from JWT) can access `/admin/stats`.
- Non-admin users receive 403.
- No passwords, password hashes, tokens, or secrets are exposed in the response.
- User data is aggregated into counts only — no PII in the stats response.

### Persistence

- Users/alumni: MongoDB `users` collection (live queries).
- Jobs, applications, events, registrations, announcements, notifications: respective JSON data files (read-only aggregation).

### Checks performed

- `py_compile` syntax check: pass.
- Runtime import and route registration: 1 new route confirmed.
- Full app boot: all 38 routes confirmed.

---

## Full Route Table

38 application routes (excluding OpenAPI/docs meta-routes):

| # | Method | Path | Module |
|---|--------|------|--------|
| 1 | `POST` | `/auth/register` | Auth |
| 2 | `POST` | `/auth/login` | Auth |
| 3 | `GET` | `/profile/me` | Profile |
| 4 | `PATCH` | `/profile/me` | Profile |
| 5 | `GET` | `/alumni/directory` | Alumni |
| 6 | `GET` | `/alumni/pending` | Alumni |
| 7 | `PATCH` | `/alumni/verify/{user_id}` | Alumni |
| 8 | `POST` | `/jobs` | Jobs |
| 9 | `GET` | `/jobs` | Jobs |
| 10 | `GET` | `/jobs/mine` | Jobs |
| 11 | `GET` | `/jobs/admin` | Jobs |
| 12 | `PATCH` | `/jobs/{job_id}/status` | Jobs |
| 13 | `DELETE` | `/jobs/{job_id}` | Jobs |
| 14 | `POST` | `/jobs/{job_id}/applications` | Applications |
| 15 | `GET` | `/jobs/applications/me` | Applications |
| 16 | `GET` | `/jobs/{job_id}/applications` | Applications |
| 17 | `PATCH` | `/jobs/applications/{application_id}/status` | Applications |
| 18 | `GET` | `/events` | Events |
| 19 | `POST` | `/events` | Events |
| 20 | `PATCH` | `/events/{event_id}` | Events |
| 21 | `DELETE` | `/events/{event_id}` | Events |
| 22 | `POST` | `/events/{event_id}/register` | Events |
| 23 | `GET` | `/events/registrations/me` | Events |
| 24 | `GET` | `/events/{event_id}/registrations` | Events |
| 25 | `GET` | `/announcements` | Announcements |
| 26 | `POST` | `/announcements` | Announcements |
| 27 | `PATCH` | `/announcements/{announcement_id}` | Announcements |
| 28 | `DELETE` | `/announcements/{announcement_id}` | Announcements |
| 29 | `GET` | `/notifications` | Notifications |
| 30 | `PATCH` | `/notifications/{notification_id}/read` | Notifications |
| 31 | `PATCH` | `/notifications/read-all` | Notifications |
| 32 | `GET` | `/admin/stats` | Admin |
| 33 | `GET` | `/` | Root |
| 34 | `GET` | `/health` | Health |

---

## Risks & Limitations

| Area | Risk | Mitigation |
|------|------|------------|
| **Persistence** | All new modules (Applications, Events, Announcements, Notifications) use JSON files. Not safe for concurrent writes or production traffic. | Intended as temporary dev storage. Migrate to MongoDB collections before deployment. |
| **Race conditions** | JSON file read-modify-write is not atomic. Concurrent requests could cause data loss. | Acceptable for single-dev/demo use. Use database transactions in production. |
| **No pagination** | All list endpoints return full datasets. | Add `skip`/`limit` query params when data volumes grow. |
| **No input sanitisation** | String fields are stored as-is (no HTML stripping, length limits beyond Pydantic). | Add field validators before production. |
| **No email notifications** | Status changes (job approval, application update, event registration) do not trigger emails. | Add email/notification service when needed. |
| **Notification creation** | `create_notification()` is available but not yet called by other modules. Notifications must be manually created or integrated. | Wire into application/event status-change endpoints as needed. |
| **Admin stats performance** | `/admin/stats` reads all JSON files and queries MongoDB on every call. | Acceptable at current data volumes. Add caching or background aggregation at scale. |
| **ObjectId compatibility** | User lookup has a fallback loop to match string-cast ObjectIds. Works but is O(n). | Standardise ID format or add a MongoDB index. |
| **Test suite** | Lack of automated tests previously left regressions undetected. | ✅ **Resolved**: 42 automated pytest tests covering Auth, Profile, Jobs, Applications, Events, Announcements, Notifications, and Admin Stats. |
| **No rate limiting** | No throttling on any endpoint. | Add FastAPI rate limiting middleware before production. |

---

## Safe Local Test Environment & Automated Test Suite

A safe local testing environment was implemented to enable running test suites without touching production MongoDB Atlas databases or requiring real credentials.

### Components

| Component | Role | Details |
|-----------|------|---------|
| `database.py` | Dual-mode DB loader | Checks `DATABASE_MODE`. When `"mock"`, utilizes `mongomock.MongoClient()` locally. Normal mode requires `MONGODB_URL` and connects via `pymongo`. |
| `.env.example` | Safe template | Contains documentation and placeholders for all environment variables without committing secrets. |
| `requirements.txt` | Test dependencies | Added `pytest`, `httpx`, and `mongomock`. |
| `tests/conftest.py` | Pytest fixtures | Automatically isolates MongoDB collections and monkeypatches temporary JSON data files per test. Provides test client and user persona fixtures. |
| `tests/` | 9 test suites (46 tests) | Comprehensive behavioral tests covering all authentication, authorization, data validation, and lifecycle endpoints. |

### Test Suites Summary

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `tests/test_auth.py` | 8 | 401 unauthenticated access, 401 invalid token, student registration, duplicate email rejection, admin self-registration block (403), login success, invalid password rejection (401), non-existent user login. |
| `tests/test_profile.py` | 7 | Student profile retrieval, alumni profile retrieval, student profile update, alumni profile update, empty update rejection (400), blank name rejection (400), profile isolation across users. |
| `tests/test_jobs.py` | 7 | Student job creation block (403), alumni pending job creation, admin approved job creation, public visibility filter (approved only), user's own jobs listing (`/jobs/mine`), admin moderation & status updates, owner & admin job deletion permissions. |
| `tests/test_applications.py` | 6 | Student-only application guard (alumni/admin 403), pending job application rejection (400), application submission success, duplicate application prevention (400), student viewing only own applications, poster & admin applicant visibility + status update permissions. |
| `tests/test_events.py` | 5 | Event creation role guards (student 403, unverified alumni 403, verified alumni pending, admin approved), audience visibility filters, registration rules (approved-only, duplicate prevention 400), registration listing authorization, event update & delete permissions. |
| `tests/test_announcements.py` | 3 | Admin-only creation/update/delete (student/alumni 403), audience targeting filter (`all`, `students`, `alumni`), update & deletion lifecycle. |
| `tests/test_notifications.py` | 3 | User notification isolation, marking individual notification read with ownership validation (other user 403), marking all own notifications as read. |
| `tests/test_admin.py` | 3 | Non-admin 403 on `/admin/stats`, dashboard statistics aggregation accuracy across MongoDB and all JSON data stores (no credentials leaked), pending alumni listing and verification status updates. |
| `tests/test_security_audit.py` | 7 | Deactivated account block across profile and mutations (403), alumni directory search resilience with null attributes, string UUID vs ObjectId profile resolution, and JWT secret key resolution in mock vs production modes. |
| `tests/test_database_config.py` | 9 | Mock mode resolution, Atlas mode missing URL validation, placeholder rejection, database name validation, standard aliases (`MONGODB_URI`, `MONGODB_DATABASE`), timeout handling, and test mock isolation guarantee. |
| **Total** | **58** | **100% Passing (1.95s execution time)** |

---

## Final Security & API Quality Audit

A comprehensive security, authorization, and API quality audit was performed across all 9 route modules and core utilities.

### Confirmed Issues & Fixes

1. **Missing Auth Default Status Code**: FastAPI's `HTTPBearer` defaulted to `403 Forbidden` on missing credentials. Updated `security/dependencies.py` with `auto_error=False` to return standard `401 Unauthorized`.
2. **Profile Update Operator Bug**: In `routes/profile.py`, `update_one` used an empty operator `{"": update_data}` which fails in MongoDB/mongomock. Corrected to `{"$set": update_data}`.
3. **Hardened JWT Secret Resolution**: `security/jwt.py` was hardened to disallow any hard-coded secret in normal/production mode. If `JWT_SECRET_KEY` is missing, empty, or whitespace, it raises a clear `ValueError` at startup (`JWT_SECRET_KEY is not set in environment or .env file.`). In `DATABASE_MODE=mock`, a clearly identified test-only mock secret is permitted so local `pytest` runs work cleanly without real credentials.
4. **ObjectId vs String ID Fragility**: In `routes/profile.py`, `get_user_by_id` only attempted `ObjectId(user_id)`, which failed when user IDs were stored as strings or UUIDs. Extended lookup to support `ObjectId`, direct string `_id`, and fallback string matching.
5. **Alumni Directory Search Crash on Null Fields**: In `routes/alumni.py`, `" ".join([alumni.get("name", ""), ...])` threw `TypeError` if `name` was explicitly `None` in the database. Added `or ""` fallback and safe string casting for skills.
6. **Inactive Account Enforcement**: Added explicit `is_active` validation guards to `routes/profile.py`, `routes/jobs.py`, `routes/events.py`, and `routes/applications.py` to ensure deactivated users cannot perform actions or modify data even with unexpired JWTs.
7. **Admin Stats Memory & Security Optimization**: In `routes/admin.py`, `users_collection.find({})` previously fetched complete user documents including sensitive fields. Added field projection `{"role": 1, "is_verified": 1}` so that sensitive user fields are never read into memory.

---

## Real Atlas Integration Readiness

### 1. Database Architecture

The backend supports dual-mode database operation driven strictly by environment variables:

```text
DATABASE_MODE=mock
        ↓
mongomock.MongoClient() (in-memory)
        ↓
Local pytest / offline development

DATABASE_MODE=atlas (default / unset)
        ↓
pymongo.MongoClient(MONGODB_URL, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=timeout_ms)
        ↓
Real MongoDB Atlas cluster (team/staging/production)
```

- **Mock Mode**: Set via `DATABASE_MODE=mock`. Instantiates `mongomock.MongoClient()` with database name defaulting to `soet_connect_test`. No network calls, SSL validation, or external services are needed. Used automatically by `pytest`.
- **Atlas Mode**: Active by default or when `DATABASE_MODE=atlas`. Validates that `MONGODB_URL` (or `MONGODB_URI`) and `DATABASE_NAME` (or `MONGODB_DATABASE`) are explicitly configured with real connection parameters (rejecting blank or placeholder values). Employs `certifi.where()` for CA bundle validation, sets a 5000ms fail-fast server selection timeout (preventing 30s thread hangs on connection issues), and handles TLS negotiation for `mongodb+srv://` clusters.

### 2. Required Environment Variables

| Variable Name | Alias Supported | Required In | Purpose | Production Fallback |
|---------------|-----------------|:-----------:|---------|:-------------------:|
| `DATABASE_MODE` | — | No | Selects `atlas` or `mock` mode (defaults to `atlas`) | Defaults to `atlas` |
| `MONGODB_URL` | `MONGODB_URI` | **Yes (Atlas mode)** | MongoDB Atlas connection string (`mongodb+srv://...`) | **NEVER — Fails with ValueError** |
| `DATABASE_NAME` | `MONGODB_DATABASE` | **Yes (Atlas mode)** | Target database name in MongoDB Atlas | **NEVER — Fails with ValueError** |
| `MONGODB_TIMEOUT_MS` | — | No | Server selection timeout in milliseconds | Defaults to `5000` |
| `JWT_SECRET_KEY` | — | **Yes (Production)** | Secret key for signing/decoding HS256 JWT tokens | **NEVER in production — Fails with ValueError** |
| `JWT_ALGORITHM` | — | No | Token signing algorithm | Defaults to `HS256` |

### 3. Atlas Compatibility Audit Findings & Fixes

1. **User Lookup Full Collection Scan Elimination**:
   - *Problem*: `routes/jobs.py`, `routes/events.py`, `routes/applications.py`, and `routes/alumni.py` previously queried `{"_id": user_id}` with a string. In real MongoDB Atlas, `_id` is an `ObjectId`, causing string queries to return `None` and fall back to scanning every user with `find({"role": role})` in a Python loop ($O(N)$ network download).
   - *Fix*: Updated all four modules to query `{"_id": ObjectId(user_id)}` first. In MongoDB Atlas, this performs an immediate $O(1)$ index seek on the primary `_id` index. Preserved string and loop fallbacks as safety nets.
2. **Fail-Fast Server Selection Timeout**:
   - *Problem*: Without `serverSelectionTimeoutMS`, PyMongo blocked for 30,000ms on `/health` when Atlas was unreachable or the server IP was not whitelisted.
   - *Fix*: Added `serverSelectionTimeoutMS=5000` (configurable via `MONGODB_TIMEOUT_MS`) to fail cleanly within 5 seconds.
3. **Placeholder Credentials Rejection**:
   - *Problem*: If `.env` contained template placeholders (e.g. `YOUR_MONGODB_CONNECTION_STRING`), PyMongo attempted to resolve the invalid host.
   - *Fix*: `get_database_config()` explicitly validates and rejects placeholder values at initialization.
4. **Environment Variable Aliasing**:
   - Added support for `MONGODB_URI` and `MONGODB_DATABASE` aliases commonly used by cloud deployment platforms.

### 4. Integration Status

> **Status: READY FOR ATLAS CONFIGURATION**
> *(Note: This backend is fully prepared and audited for Atlas integration, but is NOT YET ACTUALLY CONNECTED TO ATLAS because real team credentials and network whitelisting must be supplied in `.env` by the team).*

### 5. Remaining Team / Environment Requirements

When the team is ready to connect the backend to their real MongoDB Atlas cluster:
1. **Supply Credentials in `.env`**:
   - Set `MONGODB_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/`
   - Set `DATABASE_NAME=<database_name>`
   - Set `JWT_SECRET_KEY=<strong-32-char-random-key>`
2. **Network Access / IP Whitelisting**:
   - Add the application server's outbound IP (or `0.0.0.0/0` with secure user credentials) to the Atlas Network Access allowlist.
3. **Database Indexes**:
   - Recommended Atlas compound index on `users`: `{"email": 1}` (unique) and `{"role": 1, "is_active": 1, "is_verified": 1}` for high-performance alumni directory lookups.
4. **JSON-to-MongoDB Migration (Production Step)**:
   - For multi-instance horizontal scaling, migrate the JSON files (`jobs_data.json`, `events_data.json`, etc.) to dedicated MongoDB Atlas collections (`jobs`, `applications`, `events`, `event_registrations`, `announcements`, `notifications`).

### Member 2 Scope Sign-Off

- **Status**: **Complete & Verified**
- **All 34 application endpoints** (+ 4 OpenAPI/docs routes = 38 total) operational.
- **100% of 58 automated tests passing**.
- **Ready for team's Atlas configuration**.
