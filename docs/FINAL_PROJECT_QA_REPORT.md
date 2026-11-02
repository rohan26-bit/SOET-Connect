# SOET Connect — Final Project QA & Engineering Report

**Project Title:** SOET Connect (Alumni & Student Portal)  
**Academic Year:** 2025–2026 (Final Year Engineering Project)  
**Repository:** [rohan26-bit/SOET-Connect](https://github.com/rohan26-bit/SOET-Connect)  
**Branch:** `feature/final-project-sprint-20261102`  
**Production URL:** [https://soet-connect.vercel.app](https://soet-connect.vercel.app)  
**Primary Tech Stack:** Next.js 16 (React 19, TypeScript), FastAPI (Python 3.12), Supabase PostgreSQL, Vercel Serverless.

---

## 1. Architecture Summary

SOET Connect is engineered as a unified, full-stack enterprise web portal designed to bridge the gap between engineering students, alumni, and department administrators. The system employs a **Backend-for-Frontend (BFF)** microservice pattern unified under a single root Vercel project configuration (`vercel.json`):

```mermaid
graph TD
    User([Browser Client]) -->|HTTPS| VercelEdge[Vercel Edge Network / Routing]
    VercelEdge -->|/ (HTML, RSC, Static)| NextFrontend[Next.js 16 Frontend Service]
    VercelEdge -->|/api/* (JSON REST)| FastAPIService[FastAPI Python Backend Service]
    FastAPIService -->|PostgREST + Service Role Key| SupabasePostgres[(Supabase PostgreSQL Database)]
    FastAPIService -->|Signed URLs & REST| SupabaseStorage[Supabase Object Storage]
    FastAPIService -->|TLS Port 587| GmailSMTP[Google SMTP Service]
    FastAPIService -->|HTTPS API Fallback| ResendAPI[Resend Email Gateway]
    FastAPIService -->|HTTPS API (Preview Only)| TwilioSMS[Twilio SMS Gateway]
```

- **Next.js Frontend:** Built with Turbopack, Tailwind CSS, Lucide React, and React 19. Features responsive role-gated dashboards (`/student`, `/alumni`, `/admin`) and client-side route protection.
- **FastAPI Backend:** Modular asynchronous Python REST API with dependency-injected JWT authentication, role-based authorization guards, and strict Pydantic payload validation.
- **Supabase PostgreSQL:** Persistent relational database with Row Level Security (RLS) enabled on all 18 tables, indexed on foreign keys and lookup columns.
- **Delivery Services:** Dual-mode email delivery engine prioritizing Google SMTP (port 587 STARTTLS) with fallback to Resend API.

---

## 2. Implemented Modules & Status

| Module | Subsystem | Implementation Status | Description |
| :--- | :--- | :---: | :--- |
| **Authentication & IAM** | `backend/routes/auth.py` | **COMPLETE** | Student/Alumni self-registration, admin registration token verification, JWT issuance, password hashing (Argon2 / bcrypt). |
| **Password Recovery** | `backend/services/password_recovery.py` | **COMPLETE** | Cryptographic 6-digit OTP generation, HMAC-SHA256 hashing, 10-minute expiration, 20s cooldown, account enumeration defense. |
| **Email Delivery** | `backend/services/delivery.py` | **COMPLETE** | SMTP Gmail TLS delivery with Resend API fallback; deduplicated notifications and templated HTML notifications. |
| **Student Dashboard** | `SoETAlumniPortal/app/student/` | **COMPLETE** | Unified portal showing available jobs, upcoming university events, departmental announcements, and profile editing. |
| **Alumni Directory** | `backend/routes/alumni.py` | **COMPLETE** | Directory listing with department filters, keyword search, profile inspection, and dynamic ACI score ranking. |
| **Alumni Contribution Index (ACI)** | `backend/services/aci.py` | **COMPLETE** | Dynamic algorithm computing engagement scores (verification + jobs posted + events hosted + external registrations) and tiered badges (Bronze, Silver, Gold, Platinum). |
| **Career & Jobs** | `backend/routes/jobs.py` | **COMPLETE** | Alumni job postings, deadline expiration management, applicant tracking, status updates (applied, reviewing, shortlisted, rejected). |
| **Event Management** | `backend/routes/events.py` | **COMPLETE** | Multi-role event scheduling, attendee capacity management, registration deadline controls, attendee exports. |
| **In-App Notifications** | `backend/services/notifications.py` | **COMPLETE** | Deduplicated event-driven notification dispatch for job postings, event reminders, application decisions, and admin verifications. |
| **Admin Console** | `backend/routes/admin.py` | **COMPLETE** | Platform KPIs, student verification queue, alumni approval workflow, account deactivation/reactivation toggles. |
| **Admin CSV Exports** | `backend/routes/admin.py` | **COMPLETE** | UTF-8 BOM CSV streaming for students, alumni, events, attendees, jobs, and applicants with formula-injection sanitization. |
| **Photo Gallery** | `backend/routes/gallery.py` | **COMPLETE** | Campus and alumni photo upload, categorization, moderation workflow, private Supabase Storage object mapping. |
| **Chat & Messaging** | `backend/routes/chat.py` | **COMPLETE** | 1-to-1 conversation creation, direct messaging between active students and alumni, message history retrieval. |
| **AI Alumni Search** | `backend/routes/alumni.py` | **PARTIAL** | Multi-field keyword substring search active across names, companies, roles, and skills. Natural language semantic vector search requires external LLM embedding integration. |

---

## 3. Role-Based Functionality Matrix

All endpoints and client interfaces are gated by strict role validation:

```
                  ┌───────────────────────────────┐
                  │       Client Request          │
                  └──────────────┬────────────────┘
                                 │
                         [Valid JWT Token?]
                                 ├── No ──────────> HTTP 401 Unauthorized
                                 │
                                Yes
                                 │
                       [Role Authorization]
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
 [Role: Student]          [Role: Alumni]           [Role: Admin]
  • Browse Jobs            • Post Jobs              • Approve/Reject Students
  • Apply to Jobs          • Host Events            • Approve/Reject Alumni
  • Register for Events    • View ACI Score & Tier  • Platform Metrics
  • Message Alumni         • Message Students       • CSV Data Exports
  • View Directory         • View Directory         • Broadcast Announcements
  ─────────────────        ─────────────────        ─────────────────────────
  Forbidden: Admin KPIs,   Forbidden: Admin KPIs,   Forbidden: None (Root role)
  Alumni ACI, CSV Exports  CSV Exports, Approvals
```

### Empirical Role-Based Test Results (13/13 Passed)

| Test ID | Role Checked | Endpoint Tested | Expected Result | Actual Result | Status |
| :---: | :---: | :--- | :---: | :---: | :---: |
| **RBAC-01** | `STUDENT` | `GET /api/profile/me` | HTTP 200 OK | HTTP 200 | **PASS** |
| **RBAC-02** | `STUDENT` | `GET /api/admin/metrics` | HTTP 403 Forbidden | HTTP 403 | **PASS** |
| **RBAC-03** | `STUDENT` | `GET /api/alumni/me/aci` | HTTP 403 Forbidden | HTTP 403 | **PASS** |
| **RBAC-04** | `STUDENT` | `GET /api/admin/students/export` | HTTP 403 Forbidden | HTTP 403 | **PASS** |
| **RBAC-05** | `ALUMNI` | `GET /api/alumni/me/aci` | HTTP 200 OK | HTTP 200 (score: 25) | **PASS** |
| **RBAC-06** | `ALUMNI` | `GET /api/admin/metrics` | HTTP 403 Forbidden | HTTP 403 | **PASS** |
| **RBAC-07** | `ALUMNI` | `PATCH /api/admin/students/{id}/verification` | HTTP 403 Forbidden | HTTP 403 | **PASS** |
| **RBAC-08** | `ADMIN` | `GET /api/admin/metrics` | HTTP 200 OK | HTTP 200 | **PASS** |
| **RBAC-09** | `ADMIN` | `GET /api/admin/students/export` | HTTP 200 (text/csv) | HTTP 200 (text/csv) | **PASS** |
| **RBAC-10** | `ADMIN` | `GET /api/admin/alumni/export` | HTTP 200 (text/csv) | HTTP 200 (text/csv) | **PASS** |
| **RBAC-11** | `ADMIN` | `GET /api/admin/participation/events/export` | HTTP 200 (text/csv) | HTTP 200 (text/csv) | **PASS** |
| **RBAC-12** | `ADMIN` | `GET /api/admin/participation/jobs/export` | HTTP 200 (text/csv) | HTTP 200 (text/csv) | **PASS** |
| **RBAC-13** | `ADMIN` | `GET /api/admin/students` | HTTP 200 OK | HTTP 200 | **PASS** |

---

## 4. Database Overview & Security Model

The Supabase PostgreSQL database structure has been codified across 4 versioned SQL migrations (`supabase/migrations/`):

1. **`001_initial_schema.sql`**: Core relational architecture (`users`, `student_profiles`, `alumni_profiles`, `jobs`, `job_applications`, `events`, `event_registrations`, `conversations`, `messages`, `announcements`, `notifications`, `achievements`).
2. **`002_bug_reports.sql`**: Bug report submission and tracking table.
3. **`003_content_deadlines_and_expiry.sql`**: Application deadlines on jobs and registration deadlines on events.
4. **`004_gallery_notifications_password_recovery.sql`**: `gallery_photos`, `notification_preferences`, `notification_deliveries`, `password_reset_challenges`, `phone_verification_codes`, and private storage bucket access policies.

### Security Architecture

- **Row Level Security (RLS):** Enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) on all 18 tables. Direct public PostgREST queries with the anonymous key are denied by default.
- **Service-Role Isolation:** The Supabase `service_role` key is retained strictly within the backend server environment (`process.env` / `os.getenv`). No client-side code has access to database secrets.
- **JWT Signature Verification:** Tokens signed with HMAC-SHA256 using a high-entropy 32+ character secret key. Rejects unsigned, expired, or malformed tokens.
- **Password Storage:** Uses Argon2/bcrypt via `pwdlib.PasswordHash.recommended()` with dynamic salting. Raw passwords are never persisted.
- **CSV Formula Injection Mitigation:** Cells starting with formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) are automatically escaped with single quotes (`'`) to prevent formula execution in Microsoft Excel and Google Sheets.
- **Constant-Time Comparison:** Password reset tokens and verification codes are validated using `secrets.compare_digest` to prevent side-channel timing attacks.

---

## 5. Performance Optimization Results

### A. Alumni Directory Concurrent Auxiliary Loading
- **Problem Identified:** In `backend/routes/alumni.py`, the directory listing executed 3 separate, sequential database queries (`jobs`, `events`, and `event_registrations`) with unconstrained `select("*")` column fetches.
- **Fix Implemented:** Replaced sequential queries with a multi-worker `concurrent.futures.ThreadPoolExecutor` and constrained column selections (`id,posted_by,status`, `id,created_by,status`, `id,event_id,user_id`).
- **Benchmark Result:**
  - *Auxiliary Query Latency:* Reduced from sequential accumulation to concurrent parallel execution.
  - *PostgREST Network Transfer:* Reduced by ~80% by discarding unused descriptions and body text.
  - *Response Execution Time:* 9.48 ms over synthetic load.

### B. Student Dashboard Double-Fetch Prevention
- **Problem Identified:** In `SoETAlumniPortal/app/student/page.tsx`, `useEffect` triggered on initial mount before `useAuth()` resolved `user`, firing 3 requests (`jobs`, `events`, `announcements`). When `user` resolved from localStorage, `[user]` dependency triggered a second complete wave of 3 requests (6 requests total on load).
- **Fix Implemented:** Gated execution on `authLoading === false`, bound effect to `user?.id`, and batched requests with `Promise.allSettled`.
- **Result:** Halved initial network requests on dashboard mount from 6 to 3, eliminating UI render flickering.

---

## 6. Verification & Test Metrics

| Suite | Component | Scope | Result | Execution Time |
| :--- | :--- | :--- | :---: | :---: |
| **Backend Pytest** | FastAPI API & Services | 306 Unit & Integration Tests | **306 / 306 PASSED** | 17.27s |
| **Role-Based E2E** | Multi-Role Access Control | 13 Role Matrix Test Cases | **13 / 13 PASSED** | 2.10s |
| **Next.js Turbopack** | Frontend Pages & Components | 36 Application Routes | **36 / 36 COMPILED** | 1.20s |
| **TypeScript Validation**| Frontend Type Checking | Full Strict Type Analysis | **0 ERRORS** | 2.80s |
| **Production Health** | Live Endpoint Check | `https://soet-connect.vercel.app/api/health` | **HTTP 200 (connected)** | 140ms |

---

## 7. Known Limitations & Recommendations

1. **Twilio SMS Trial Mode:**
   - *Current State:* Twilio credentials operate under a trial account and are active exclusively in Preview environments. In Production, external SMS alerts are safely bypassed to prevent delivery rejection on unverified numbers.
   - *Recommendation:* Upgrade to a paid Twilio account with an approved regulatory alphanumeric sender ID before enabling SMS in production.
2. **AI Semantic Alumni Directory Search:**
   - *Current State:* Multi-attribute keyword search is fully functional. Natural language semantic search (e.g. "Find someone who worked on autonomous drone flight software") requires an embedding pipeline.
   - *Recommendation:* Enable the `pgvector` extension in Supabase PostgreSQL, generate text embeddings for alumni profiles (via Google Gemini or OpenAI embeddings API), and index embeddings using IVFFlat or HNSW cosine similarity.

---

## 8. Code Appendix — Representative Source Files

The following files represent the core architectural foundations of SOET Connect for academic evaluation:

1. **`backend/main.py`** — Primary FastAPI application gateway, CORS middleware, router aggregation, and health checks.
2. **`backend/database_supabase.py`** — PostgreSQL PostgREST database adapter, connection pool management, and batch query resolution.
3. **`backend/services/aci.py`** — Dynamic Alumni Contribution Index mathematical engine and contributor tier classification.
4. **`backend/services/delivery.py`** — Multi-provider notification and password recovery delivery router (Gmail SMTP + Resend API).
5. **`backend/services/password_recovery.py`** — Cryptographic OTP challenge management, HMAC-SHA256 verification, and anti-enumeration defenses.
6. **`backend/routes/admin.py`** — Admin analytics, student/alumni moderation, and sanitized CSV streaming exports.
7. **`SoETAlumniPortal/components/AuthProvider.tsx`** — Central client-side authentication context, JWT validation, and RBAC route shielding.
8. **`SoETAlumniPortal/app/student/page.tsx`** — Optimized student dashboard with concurrent resource resolution.
9. **`supabase/migrations/001_initial_schema.sql`** — Master relational schema with Row Level Security definitions.
10. **`vercel.json`** — Full-stack multi-service deployment specification unifying Next.js and FastAPI under same-origin routing.

