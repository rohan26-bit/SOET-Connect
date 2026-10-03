"""
SOET Connect — Comprehensive Live Supabase PostgreSQL Verification Script
========================================================================
Validates all 15 core backend operations against the live remote Supabase
PostgreSQL database configured in backend/.env.

Security Notice:
  No API keys, secrets, passwords, or tokens are logged or revealed.
"""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Force live Supabase mode
os.environ["DATABASE_MODE"] = "supabase"

from fastapi.testclient import TestClient
from main import app
from database import test_database_connection, supabase
from security.jwt import decode_access_token


def run_live_verification():
    print("=" * 70)
    print("STARTING LIVE SUPABASE VERIFICATION (DATABASE_MODE=supabase)")
    print("=" * 70)

    results = {}
    test_id = str(uuid.uuid4())[:8]
    created_resources = {
        "user_ids": [],
        "job_ids": [],
        "event_ids": [],
        "announcement_ids": [],
        "notification_ids": [],
        "conversation_ids": [],
        "achievement_ids": [],
    }

    client = TestClient(app)

    try:
        # -------------------------------------------------------------
        # 1. /health Endpoint
        # -------------------------------------------------------------
        print("\n[1/15] Verifying /health endpoint against live Supabase...")
        res = client.get("/health")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        assert data.get("api") == "healthy", f"API not healthy: {data}"
        assert data.get("database") == "connected", f"Database not connected: {data}"
        results["1. /health Endpoint"] = "PASS"
        print("  -> PASSED: API is healthy and connected to live Supabase.")

        # -------------------------------------------------------------
        # 2. User Registration (Student & Alumni)
        # -------------------------------------------------------------
        print("\n[2/15] Verifying user registration in Supabase public.users...")
        student_email = f"live_student_{test_id}@soettest.edu"
        alumni_email = f"live_alumni_{test_id}@soettest.edu"
        admin_email = f"live_admin_{test_id}@soettest.edu"
        common_password = f"SecurePass!{test_id}Aa1"

        student_payload = {
            "name": f"Live Student {test_id}",
            "email": student_email,
            "password": common_password,
            "role": "student",
            "student_id": f"STU-{test_id}",
            "department": "Computer Science",
            "course": "B.Tech",
            "academic_year": "3rd Year",
            "graduation_year": "2026",
        }
        res_stu = client.post("/auth/register", json=student_payload)
        assert res_stu.status_code == 201, f"Student registration failed ({res_stu.status_code}): {res_stu.text}"
        stu_data = res_stu.json()
        stu_id = stu_data["user_id"]
        created_resources["user_ids"].append(stu_id)

        alumni_payload = {
            "name": f"Live Alumni {test_id}",
            "email": alumni_email,
            "password": common_password,
            "role": "alumni",
            "alumni_id": f"ALU-{test_id}",
            "department": "Information Technology",
            "degree": "B.Tech",
            "graduation_year": "2022",
            "company": "Tech Corp",
            "designation": "Staff Engineer",
        }
        res_alu = client.post("/auth/register", json=alumni_payload)
        assert res_alu.status_code == 201, f"Alumni registration failed ({res_alu.status_code}): {res_alu.text}"
        alu_data = res_alu.json()
        alu_id = alu_data["user_id"]
        created_resources["user_ids"].append(alu_id)

        # Create verified admin user in Supabase public.users
        from pwdlib import PasswordHash
        from database import users_collection
        ph = PasswordHash.recommended()
        admin_doc = {
            "name": f"Live Admin {test_id}",
            "email": admin_email,
            "password_hash": ph.hash(common_password),
            "role": "admin",
            "is_active": True,
            "is_verified": True,
            "verification_status": "approved",
        }
        res_adm = users_collection.insert_one(admin_doc)
        adm_id = str(res_adm.inserted_id)
        created_resources["user_ids"].append(adm_id)

        results["2. User Registration"] = "PASS"
        print("  -> PASSED: Student, Alumni, and Admin registered in Supabase users & profiles.")

        # -------------------------------------------------------------
        # 3. User Login & Password Authentication
        # -------------------------------------------------------------
        print("\n[3/15] Verifying user login with Argon2 password verification...")
        res_login_stu = client.post("/auth/login", json={"email": student_email, "password": common_password})
        assert res_login_stu.status_code == 200, f"Student login failed: {res_login_stu.text}"
        stu_token = res_login_stu.json()["access_token"]
        stu_headers = {"Authorization": f"Bearer {stu_token}"}

        res_login_alu = client.post("/auth/login", json={"email": alumni_email, "password": common_password})
        assert res_login_alu.status_code == 200, f"Alumni login failed: {res_login_alu.text}"
        alu_token = res_login_alu.json()["access_token"]
        alu_headers = {"Authorization": f"Bearer {alu_token}"}

        res_login_adm = client.post("/auth/login", json={"email": admin_email, "password": common_password})
        assert res_login_adm.status_code == 200, f"Admin login failed: {res_login_adm.text}"
        adm_token = res_login_adm.json()["access_token"]
        adm_headers = {"Authorization": f"Bearer {adm_token}"}

        results["3. User Login (Argon2)"] = "PASS"
        print("  -> PASSED: Credentials verified via Argon2, JWT tokens issued.")

        # -------------------------------------------------------------
        # 4. JWT Verification
        # -------------------------------------------------------------
        print("\n[4/15] Verifying JWT token decoding and payload integrity...")
        stu_payload_dec = decode_access_token(stu_token)
        assert stu_payload_dec["user_id"] == stu_id, "User ID mismatch in JWT sub"
        assert stu_payload_dec["role"] == "student", "Role mismatch in JWT"

        adm_payload_dec = decode_access_token(adm_token)
        assert adm_payload_dec["user_id"] == adm_id, "User ID mismatch in JWT sub"
        assert adm_payload_dec["role"] == "admin", "Role mismatch in JWT"

        results["4. JWT Verification"] = "PASS"
        print("  -> PASSED: JWT tokens securely verified and claims decoded.")

        # -------------------------------------------------------------
        # 5. Role-Based Access Control (RBAC)
        # -------------------------------------------------------------
        print("\n[5/15] Verifying Role-Based Access Control (RBAC)...")
        res_rb_forbidden = client.get("/admin/metrics", headers=stu_headers)
        assert res_rb_forbidden.status_code == 403, f"Student should be forbidden from admin metrics: {res_rb_forbidden.status_code}"

        res_rb_allowed = client.get("/admin/metrics", headers=adm_headers)
        assert res_rb_allowed.status_code == 200, f"Admin should access admin metrics: {res_rb_allowed.status_code}"

        results["5. Role-Based Access Control (RBAC)"] = "PASS"
        print("  -> PASSED: Student correctly forbidden (403), Admin authorized (200).")

        # -------------------------------------------------------------
        # 6. Profile Read & Update
        # -------------------------------------------------------------
        print("\n[6/15] Verifying profile read and update in Supabase...")
        res_prof_me = client.get("/profile/me", headers=stu_headers)
        assert res_prof_me.status_code == 200
        assert res_prof_me.json()["email"] == student_email

        res_prof_update = client.put("/profile/me", json={
            "fullName": f"Updated Student {test_id}",
            "department": "Artificial Intelligence",
            "phone": "9999988888",
        }, headers=stu_headers)
        assert res_prof_update.status_code == 200, f"Profile update failed: {res_prof_update.text}"
        updated_prof = res_prof_update.json()
        assert updated_prof["profile"]["name"] == f"Updated Student {test_id}"

        results["6. Profile Read & Update"] = "PASS"
        print("  -> PASSED: Profile retrieved and updated in PostgreSQL tables.")

        # -------------------------------------------------------------
        # 7. Jobs CRUD
        # -------------------------------------------------------------
        print("\n[7/15] Verifying Jobs CRUD in Supabase public.jobs...")
        job_payload = {
            "title": f"Senior Engineer {test_id}",
            "company": f"Live Corp {test_id}",
            "description": "Full-time position for skilled graduates",
            "location": "Bengaluru, India",
            "employment_type": "full-time",
            "salary_range": "15-20 LPA",
            "skills": ["Python", "FastAPI", "PostgreSQL"],
        }
        res_job_create = client.post("/jobs", json=job_payload, headers=adm_headers)
        assert res_job_create.status_code == 201 or res_job_create.status_code == 200, f"Job creation failed: {res_job_create.text}"
        job_data = res_job_create.json()["job"]
        job_id = job_data["id"]
        created_resources["job_ids"].append(job_id)

        res_jobs_list = client.get("/jobs", headers=stu_headers)
        assert res_jobs_list.status_code == 200
        assert any(j["id"] == job_id for j in res_jobs_list.json())

        res_job_detail = client.get(f"/jobs/{job_id}", headers=stu_headers)
        assert res_job_detail.status_code == 200
        assert res_job_detail.json()["title"] == job_payload["title"]

        results["7. Jobs CRUD"] = "PASS"
        print("  -> PASSED: Job created, listed, and retrieved from Supabase.")

        # -------------------------------------------------------------
        # 8. Job Applications
        # -------------------------------------------------------------
        print("\n[8/15] Verifying Job Applications in Supabase public.job_applications...")
        app_payload = {
            "resume_url": "https://storage.example.com/resumes/live_test.pdf",
            "cover_letter": "I am excited to apply for this role.",
        }
        res_app_create = client.post(f"/jobs/{job_id}/applications", json=app_payload, headers=stu_headers)
        assert res_app_create.status_code == 201 or res_app_create.status_code == 200, f"Application failed: {res_app_create.text}"

        res_my_apps = client.get("/applications/me", headers=stu_headers)
        assert res_my_apps.status_code == 200
        assert any(a.get("job_id") == job_id for a in res_my_apps.json())

        results["8. Job Applications"] = "PASS"
        print("  -> PASSED: Job application submitted and queried from public.job_applications.")

        # -------------------------------------------------------------
        # 9. Events CRUD
        # -------------------------------------------------------------
        print("\n[9/15] Verifying Events CRUD in Supabase public.events...")
        future_date = "2026-11-25"
        event_payload = {
            "title": f"Alumni Summit {test_id}",
            "description": "Annual tech seminar",
            "event_type": "Conference",
            "event_date": future_date,
            "start_time": "10:00",
            "location": "Main Auditorium",
        }
        res_ev_create = client.post("/events", json=event_payload, headers=adm_headers)
        assert res_ev_create.status_code == 200, f"Event creation failed: {res_ev_create.text}"
        ev_data = res_ev_create.json()["event"]
        ev_id = ev_data["id"]
        created_resources["event_ids"].append(ev_id)

        res_ev_list = client.get("/events", headers=stu_headers)
        assert res_ev_list.status_code == 200
        assert any(e["id"] == ev_id for e in res_ev_list.json())

        res_ev_detail = client.get(f"/events/{ev_id}", headers=stu_headers)
        assert res_ev_detail.status_code == 200
        assert res_ev_detail.json()["title"] == event_payload["title"]

        results["9. Events CRUD"] = "PASS"
        print("  -> PASSED: Event created, listed, and queried from public.events.")

        # -------------------------------------------------------------
        # 10. Event Registrations
        # -------------------------------------------------------------
        print("\n[10/15] Verifying Event Registrations in Supabase public.event_registrations...")
        res_ev_reg = client.post(f"/events/{ev_id}/register", headers=stu_headers)
        assert res_ev_reg.status_code == 200, f"Event registration failed: {res_ev_reg.text}"

        res_my_regs = client.get("/events/registrations/me", headers=stu_headers)
        assert res_my_regs.status_code == 200
        assert any(r.get("event_id") == ev_id for r in res_my_regs.json())

        # Cancel registration
        res_cancel = client.delete(f"/events/{ev_id}/register", headers=stu_headers)
        assert res_cancel.status_code == 200

        results["10. Event Registrations"] = "PASS"
        print("  -> PASSED: Event registration and cancellation verified.")

        # -------------------------------------------------------------
        # 11. Announcements CRUD
        # -------------------------------------------------------------
        print("\n[11/15] Verifying Announcements CRUD in Supabase public.announcements...")
        ann_payload = {
            "title": f"Important Announcement {test_id}",
            "content": "Campus recruitment cycle starts next week.",
            "target_audience": "all",
            "priority": "high",
        }
        res_ann_create = client.post("/announcements", json=ann_payload, headers=adm_headers)
        assert res_ann_create.status_code == 201 or res_ann_create.status_code == 200, f"Announcement creation failed: {res_ann_create.text}"
        ann_data = res_ann_create.json()["announcement"]
        ann_id = ann_data["id"]
        created_resources["announcement_ids"].append(ann_id)

        res_ann_list = client.get("/announcements", headers=stu_headers)
        assert res_ann_list.status_code == 200
        assert any(a["id"] == ann_id for a in res_ann_list.json())

        results["11. Announcements CRUD"] = "PASS"
        print("  -> PASSED: Announcement created and listed from public.announcements.")

        # -------------------------------------------------------------
        # 12. Notifications
        # -------------------------------------------------------------
        print("\n[12/15] Verifying Notifications in Supabase public.notifications...")
        from services.notifications import create_notification
        notif = create_notification(
            user_id=stu_id,
            title=f"Notification {test_id}",
            message="Your registration has been confirmed.",
            notification_type="general",
        )
        assert notif and notif.get("id"), "Notification creation failed"
        notif_id = notif["id"]
        created_resources["notification_ids"].append(notif_id)

        res_notif_list = client.get("/notifications", headers=stu_headers)
        assert res_notif_list.status_code == 200
        assert any(n["id"] == notif_id for n in res_notif_list.json())

        res_read = client.patch(f"/notifications/{notif_id}/read", headers=stu_headers)
        assert res_read.status_code == 200

        results["12. Notifications"] = "PASS"
        print("  -> PASSED: Notification created, read, and marked as read.")

        # -------------------------------------------------------------
        # 13. Chat Messaging
        # -------------------------------------------------------------
        print("\n[13/15] Verifying Chat Messaging in Supabase conversations & messages...")
        res_conv = client.post("/chat/conversations", json={"participant_id": alu_id}, headers=stu_headers)
        assert res_conv.status_code in (200, 201), f"Conversation creation failed: {res_conv.text}"
        conv_id = res_conv.json()["id"]
        created_resources["conversation_ids"].append(conv_id)

        res_msg = client.post(f"/chat/conversations/{conv_id}/messages", json={"content": f"Hello from student {test_id}!"}, headers=stu_headers)
        assert res_msg.status_code in (200, 201), f"Send message failed: {res_msg.text}"
        msg_id = res_msg.json()["id"]

        res_msgs_list = client.get(f"/chat/conversations/{conv_id}/messages", headers=alu_headers)
        assert res_msgs_list.status_code == 200
        assert any(m["id"] == msg_id for m in res_msgs_list.json())

        results["13. Chat Messaging"] = "PASS"
        print("  -> PASSED: Conversation, participant links, and message persisted.")

        # -------------------------------------------------------------
        # 14. Achievements
        # -------------------------------------------------------------
        print("\n[14/15] Verifying Achievements in Supabase public.achievements...")
        ach_row = {
            "user_id": alu_id,
            "title": f"Best Innovator {test_id}",
            "description": "Awarded for exceptional open-source contributions.",
            "category": "award",
            "achievement_date": "2026-05-10",
            "issuing_organization": "Global Tech Forum",
            "visibility": "public",
        }
        ach_insert = supabase.table("achievements").insert(ach_row).execute()
        assert ach_insert.data, f"Achievement insert failed: {ach_insert}"
        ach_id = str(ach_insert.data[0]["id"])
        created_resources["achievement_ids"].append(ach_id)

        ach_query = supabase.table("achievements").select("*").eq("id", ach_id).execute()
        assert ach_query.data and len(ach_query.data) == 1
        assert ach_query.data[0]["title"] == ach_row["title"]

        results["14. Achievements"] = "PASS"
        print("  -> PASSED: Achievement inserted and retrieved from public.achievements.")

        # -------------------------------------------------------------
        # 15. Admin Metrics & Stats
        # -------------------------------------------------------------
        print("\n[15/15] Verifying Admin Metrics & Aggregations...")
        res_metrics = client.get("/admin/metrics", headers=adm_headers)
        assert res_metrics.status_code == 200
        m_data = res_metrics.json()
        assert "totalStudents" in m_data
        assert "totalAlumni" in m_data
        assert "totalJobs" in m_data
        assert "totalEvents" in m_data

        res_stats = client.get("/admin/stats", headers=adm_headers)
        assert res_stats.status_code == 200
        s_data = res_stats.json()
        assert "users" in s_data
        assert "jobs" in s_data
        assert "applications" in s_data
        assert "events" in s_data

        results["15. Admin Metrics & Stats"] = "PASS"
        print("  -> PASSED: Admin metrics and aggregation queries executed successfully.")

    finally:
        print("\n" + "=" * 70)
        print("CLEANING UP TEST RECORDS FROM LIVE SUPABASE...")
        print("=" * 70)
        try:
            for aid in created_resources["achievement_ids"]:
                supabase.table("achievements").delete().eq("id", aid).execute()
            for nid in created_resources["notification_ids"]:
                supabase.table("notifications").delete().eq("id", nid).execute()
            for anid in created_resources["announcement_ids"]:
                supabase.table("announcements").delete().eq("id", anid).execute()
            for eid in created_resources["event_ids"]:
                supabase.table("event_registrations").delete().eq("event_id", eid).execute()
                supabase.table("events").delete().eq("id", eid).execute()
            for jid in created_resources["job_ids"]:
                supabase.table("job_applications").delete().eq("job_id", jid).execute()
                supabase.table("jobs").delete().eq("id", jid).execute()
            for cid in created_resources["conversation_ids"]:
                supabase.table("messages").delete().eq("conversation_id", cid).execute()
                supabase.table("conversation_participants").delete().eq("conversation_id", cid).execute()
                supabase.table("conversations").delete().eq("id", cid).execute()
            for uid in created_resources["user_ids"]:
                supabase.table("student_profiles").delete().eq("user_id", uid).execute()
                supabase.table("alumni_profiles").delete().eq("user_id", uid).execute()
                supabase.table("users").delete().eq("id", uid).execute()
            print("  -> Cleanup complete: All test entities removed safely.")
        except Exception as cleanup_err:
            print(f"  -> Cleanup warning: {cleanup_err}")

    print("\n" + "=" * 70)
    print("LIVE SUPABASE VERIFICATION SUMMARY:")
    print("=" * 70)
    all_passed = True
    for test_name, status in results.items():
        print(f"  {test_name:<40}: {status}")
        if status != "PASS":
            all_passed = False

    print("=" * 70)
    if all_passed and len(results) == 15:
        print("ALL 15 LIVE SUPABASE OPERATIONS PASSED SUCCESSFULLY!")
        return 0
    else:
        print(f"FAILED: Only {len(results)}/15 operations completed.")
        return 1


if __name__ == "__main__":
    sys.exit(run_live_verification())
