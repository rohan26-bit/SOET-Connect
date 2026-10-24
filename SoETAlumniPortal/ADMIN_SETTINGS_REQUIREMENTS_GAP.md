# SOET Connect — Admin Settings Requirements Gap Analysis

**Document Status:** Pending Specification / Blocked for Implementation  
**Created:** 2026-10-03  
**Target Architecture:** Next.js App Router (`SoETAlumniPortal`) → FastAPI (`http://127.0.0.1:8000`) → MongoDB  

---

## 1. Current Navigation Requirement

In [SoETAlumniPortal/components/DashboardLayout.tsx (Line 54–56)](file:///c:/Users/RUSHIKESH/SOET-Connect/SoETAlumniPortal/components/DashboardLayout.tsx#L54-L56), the administrator navigation menu explicitly defines:

```typescript
const adminMoreNavItems = [
  { name: 'Settings', icon: Settings, href: '/admin/settings' },
];
```

When a user logs in with the `admin` role, this menu item is rendered in both the desktop sidebar and the mobile drawer under the **"Preferences"** heading.

---

## 2. Evidence That `/admin/settings` is Missing

- **Filesystem Verification:** The directory `SoETAlumniPortal/app/admin/settings/` and file `SoETAlumniPortal/app/admin/settings/page.tsx` do **not** exist.
- **Runtime Impact:** Clicking the "Settings" link in the Admin navigation triggers an unstyled Next.js `404 | This page could not be found` error, removing the user from the `DashboardLayout` shell and stranding them outside the application UI.
- **Audit Finding:** Confirmed as the sole production-blocking navigation defect across the entire frontend.

---

## 3. Existing Prototype Evidence

The legacy prototype artifact [SoETAlumniPortal/index.html (Lines 1812–1845)](file:///c:/Users/RUSHIKESH/SOET-Connect/SoETAlumniPortal/index.html#L1812-L1845) contains a prototype function `SettingsPage()`:

```jsx
function SettingsPage() {
  const { user, theme, toggleTheme, toast } = useApp();
  // ...
  return (
    <Wrap>
      {user && <Breadcrumbs items={[{ label: 'Home', href: `/${user.role === 'admin' ? 'admin' : user.role}` }, { label: 'Settings' }]} />}
      <h1 className="page-title mb-2">Settings</h1>
      
      {/* 1. Appearance */}
      <div className="card mb-1">
        <h2>Appearance</h2>
        <button onClick={toggleTheme}>Theme Toggle (Light/Dark)</button>
      </div>

      {/* 2. Notifications */}
      <div className="card mb-1">
        <h2>Notifications</h2>
        {['Email digests', 'Mentorship alerts', 'Event reminders'].map(label => (
          <label><input type="checkbox" defaultChecked /> {label}</label>
        ))}
      </div>

      {/* 3. Security */}
      <div className="card">
        <h2>Security</h2>
        <p>Password change and 2FA will connect to your auth API.</p>
        <button onClick={() => toast('Password flow → POST /api/auth/change-password')}>Change password</button>
      </div>
    </Wrap>
  );
}
```

*Note:* This prototype was a unified mockup designed before role isolation was introduced. It defines client-side mock checkboxes and placeholder toast notifications, but contains no administrator-specific management controls.

---

## 4. Existing Backend Capabilities

The FastAPI backend currently exposes the following relevant endpoints:

| Endpoint | Method | Role | Description |
| :--- | :---: | :---: | :--- |
| `/profile/me` | `GET` | All | Fetch own user profile details (ID, name, email, avatar). |
| `/profile/me` | `PATCH` | All | Update own `full_name` and `avatar_url`. |
| `/admin/metrics` | `GET` | Admin | Fetch live operational dashboard counts. |
| `/admin/stats` | `GET` | Admin | Fetch aggregate system counts from MongoDB and JSON data files. |
| `/admin/students` | `GET` | Admin | Fetch directory of student accounts with enrollment details. |
| `/admin/users/{user_id}/active` | `PATCH` | Admin | Toggle account status (`is_active: true/false`). |
| `/alumni/pending` | `GET` | Admin | List alumni pending verification. |
| `/alumni/verify/{user_id}` | `PATCH` | Admin | Approve, reject, or suspend an alumni account. |
| `/jobs/admin` | `GET` | Admin | List all job postings across all statuses. |
| `/jobs/{job_id}/status` | `PATCH` | Admin | Moderate job posting status (`pending`, `approved`, `rejected`). |
| `/announcements` | `POST/PATCH/DELETE` | Admin | Full CRUD for broadcast announcements. |
| `/events/{event_id}` | `PATCH/DELETE` | Admin | Moderate and manage events. |

---

## 5. Missing Backend Capabilities

The backend currently has **no endpoints, database collections, or Pydantic schemas** for:

1. **System / Platform Configuration:**
   - No `GET /admin/settings` or `PATCH /admin/settings` endpoint.
   - No database collection or settings model storing platform-wide flags (e.g., maintenance mode, registration open/closed, auto-approval thresholds).
2. **Administrator Password Management:**
   - No `POST /auth/change-password` or `POST /auth/reset-password` endpoint.
3. **Two-Factor Authentication (2FA):**
   - No TOTP/SMS/MFA infrastructure or endpoints.
4. **Admin Notification Subscriptions:**
   - No backend storage for notification preferences (e.g., whether an admin receives email alerts for new alumni verification requests or job submissions).

---

## 6. Confirmed Requirements vs. Requirements Not Specified

### Confirmed Requirements (Authoritative)
1. **Route Location:** Must exist at `/admin/settings` within the Next.js App Router tree.
2. **Layout Integration:** Must render within `<DashboardLayout>` and utilize the established Fluent/Tailwind design tokens (`bg-white rounded-3xl border border-slate-200 shadow-sm`).
3. **Role Protection:** Must be strictly restricted to `role: 'admin'` via `AuthProvider` route guards.
4. **No Direct Copy of Student Settings:** `/student/settings` contains student-specific preferences ("New job postings matching your skills", "Messages from alumni", "Show my profile to Alumni") and must **not** simply be duplicated for Admin.

### Requirements Not Specified (Gaps)
1. **Scope of Admin Settings:**
   - Option A: **Personal Administrator Profile / Preferences** (updating admin display name, avatar, local UI theme preference, email digest preferences).
   - Option B: **Platform & Governance Settings** (toggling alumni verification requirements, batch registration allowlists, job post auto-moderation rules).
   - Option C: **System Status & Maintenance** (viewing API connectivity, database status, clearing dev JSON stores, maintenance mode toggle).
   - Option D: **Security & Credentials** (admin password change, rotating registration secret).
2. **Persistence Strategy:**
   - Should settings persist to a new MongoDB collection (`settings`), to the existing admin `user` document via `profile/me`, or remain local/informational pending backend endpoint delivery?

---

## 7. Exact Information Needed from Project Mentor / Team Before Implementation

To proceed with implementation without inventing unsanctioned functionality, the project team must clarify:

1. **What is the functional scope of `/admin/settings` for the current milestone?**
   - *Recommendation for Milestone 1:* Implement `/admin/settings` as an **Administrator Profile & System Overview** page that:
     - Leverages existing `PATCH /profile/me` for updating the administrator's display name and avatar.
     - Displays live system status indicators (FastAPI backend connectivity, MongoDB connection state, current environment).
     - Provides informational notices for future capabilities (password change, platform policy configuration) without fake UI controls.
2. **Should backend endpoints be created first, or should the frontend provide a read-only system status interface?**
3. **Is password modification required for the Administrator in this release, and if so, when will `POST /auth/change-password` be added to `backend/routes/auth.py`?**
