import json
from pathlib import Path
import sys

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest
from fastapi.testclient import TestClient

from main import app
from database import users_collection
from security.jwt import create_access_token
import services.aci as aci_service
import routes.alumni as alumni_routes


client = TestClient(app)


def _get_or_create_user(
    uid: str,
    name: str,
    email: str,
    role: str,
    is_verified: bool = True,
    verification_status: str = "approved",
    is_active: bool = True,
):
    user = users_collection.find_one({"_id": uid})
    if not user:
        user = {
            "_id": uid,
            "name": name,
            "email": email,
            "role": role,
            "is_active": is_active,
            "is_verified": is_verified,
            "verification_status": verification_status,
            "alumni_profile": {
                "department": "Computer Engineering",
                "graduation_year": "2022",
                "company": "Tech Corp",
                "designation": "Software Engineer",
                "skills": ["Python", "FastAPI"],
            } if role == "alumni" else {},
        }
        if hasattr(users_collection, "users"):
            users_collection.users.append(user)
        else:
            users_collection.insert_one(user)
    else:
        user["is_verified"] = is_verified
        user["verification_status"] = verification_status
        user["is_active"] = is_active
    return user


@pytest.fixture(autouse=True)
def clean_aci_environment(tmp_path, monkeypatch):
    """Isolate jobs, events, and registrations in a temporary directory per test."""
    test_jobs_file = tmp_path / "jobs_data.json"
    test_events_file = tmp_path / "events_data.json"
    test_reg_file = tmp_path / "event_registrations_data.json"

    test_jobs_file.write_text("[]", encoding="utf-8")
    test_events_file.write_text("[]", encoding="utf-8")
    test_reg_file.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(aci_service, "JOBS_FILE", test_jobs_file)
    monkeypatch.setattr(aci_service, "EVENTS_FILE", test_events_file)
    monkeypatch.setattr(aci_service, "REGISTRATIONS_FILE", test_reg_file)

    monkeypatch.setattr(alumni_routes, "JOBS_FILE", test_jobs_file)
    monkeypatch.setattr(alumni_routes, "EVENTS_FILE", test_events_file)
    monkeypatch.setattr(alumni_routes, "REGISTRATIONS_FILE", test_reg_file)


# ------------------------------------------------------------
# 1. Verified alumni with no activity -> 25 points, Bronze
# ------------------------------------------------------------
def test_1_verified_alumni_no_activity():
    uid = "test-alumni-1"
    user = _get_or_create_user(uid, "Verified Alum", "alum1@test.com", "alumni", True, "approved")

    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=[], events=[], registrations=[])
    assert res["score"] == 25
    assert res["tier"] == "Bronze Contributor"
    assert res["badge"] == "🥉"
    assert res["breakdown"]["verification"] == 25
    assert res["breakdown"]["jobs"] == 0
    assert res["breakdown"]["events"] == 0
    assert res["breakdown"]["registrations"] == 0


# ------------------------------------------------------------
# 2. Unverified alumni -> 0 points
# ------------------------------------------------------------
def test_2_unverified_alumni_zero_points():
    uid = "test-alumni-unver"
    user = _get_or_create_user(uid, "Unverified Alum", "unver@test.com", "alumni", False, "pending")

    jobs = [{"id": "j1", "posted_by": uid, "status": "approved"}]
    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=jobs, events=[], registrations=[])
    assert res["score"] == 0
    assert res["tier"] == "Bronze Contributor"
    assert res["badge"] == "🥉"
    assert res["breakdown"]["verification"] == 0
    assert res["breakdown"]["jobs"] == 0


# ------------------------------------------------------------
# 3. One approved job -> 75 total with verification (25 + 50)
# ------------------------------------------------------------
def test_3_one_approved_job():
    uid = "test-alumni-3"
    user = _get_or_create_user(uid, "Alum 3", "alum3@test.com", "alumni", True, "approved")

    jobs = [{"id": "job-1", "posted_by": uid, "status": "approved"}]
    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=jobs, events=[], registrations=[])
    assert res["score"] == 75
    assert res["tier"] == "Silver Contributor"
    assert res["badge"] == "🥈"
    assert res["breakdown"]["verification"] == 25
    assert res["breakdown"]["jobs"] == 50
    assert res["activity_counts"]["approved_jobs"] == 1


# ------------------------------------------------------------
# 4. One approved event -> 65 total with verification (25 + 40)
# ------------------------------------------------------------
def test_4_one_approved_event():
    uid = "test-alumni-4"
    user = _get_or_create_user(uid, "Alum 4", "alum4@test.com", "alumni", True, "approved")

    events = [{"id": "evt-1", "created_by": uid, "status": "approved"}]
    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=[], events=events, registrations=[])
    assert res["score"] == 65
    assert res["tier"] == "Silver Contributor"
    assert res["badge"] == "🥈"
    assert res["breakdown"]["verification"] == 25
    assert res["breakdown"]["events"] == 40
    assert res["activity_counts"]["approved_events"] == 1


# ------------------------------------------------------------
# 5. Pending job gives 0
# ------------------------------------------------------------
def test_5_pending_job_gives_zero():
    uid = "test-alumni-5"
    user = _get_or_create_user(uid, "Alum 5", "alum5@test.com", "alumni", True, "approved")

    jobs = [{"id": "job-pending", "posted_by": uid, "status": "pending"}]
    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=jobs, events=[], registrations=[])
    assert res["score"] == 25
    assert res["breakdown"]["jobs"] == 0
    assert res["activity_counts"]["approved_jobs"] == 0


# ------------------------------------------------------------
# 6. Rejected job gives 0
# ------------------------------------------------------------
def test_6_rejected_job_gives_zero():
    uid = "test-alumni-6"
    user = _get_or_create_user(uid, "Alum 6", "alum6@test.com", "alumni", True, "approved")

    jobs = [{"id": "job-rejected", "posted_by": uid, "status": "rejected"}]
    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=jobs, events=[], registrations=[])
    assert res["score"] == 25
    assert res["breakdown"]["jobs"] == 0
    assert res["activity_counts"]["approved_jobs"] == 0


# ------------------------------------------------------------
# 7. Pending event gives 0
# ------------------------------------------------------------
def test_7_pending_event_gives_zero():
    uid = "test-alumni-7"
    user = _get_or_create_user(uid, "Alum 7", "alum7@test.com", "alumni", True, "approved")

    events = [{"id": "evt-pending", "created_by": uid, "status": "pending"}]
    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=[], events=events, registrations=[])
    assert res["score"] == 25
    assert res["breakdown"]["events"] == 0
    assert res["activity_counts"]["approved_events"] == 0


# ------------------------------------------------------------
# 8. Rejected event gives 0
# ------------------------------------------------------------
def test_8_rejected_event_gives_zero():
    uid = "test-alumni-8"
    user = _get_or_create_user(uid, "Alum 8", "alum8@test.com", "alumni", True, "approved")

    events = [{"id": "evt-rejected", "created_by": uid, "status": "rejected"}]
    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=[], events=events, registrations=[])
    assert res["score"] == 25
    assert res["breakdown"]["events"] == 0
    assert res["activity_counts"]["approved_events"] == 0


# ------------------------------------------------------------
# 9. Valid external registration gives +10
# ------------------------------------------------------------
def test_9_valid_external_registration():
    uid = "test-alumni-9"
    user = _get_or_create_user(uid, "Alum 9", "alum9@test.com", "alumni", True, "approved")

    events = [{"id": "evt-ext", "created_by": "other-user", "status": "approved"}]
    registrations = [{"id": "r1", "event_id": "evt-ext", "user_id": uid}]

    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=[], events=events, registrations=registrations)
    assert res["score"] == 35  # 25 + 10
    assert res["breakdown"]["registrations"] == 10
    assert res["activity_counts"]["valid_registrations"] == 1


# ------------------------------------------------------------
# 10. Self-registration gives 0
# ------------------------------------------------------------
def test_10_self_registration_gives_zero():
    uid = "test-alumni-10"
    user = _get_or_create_user(uid, "Alum 10", "alum10@test.com", "alumni", True, "approved")

    events = [{"id": "evt-self", "created_by": uid, "status": "approved"}]
    registrations = [{"id": "r-self", "event_id": "evt-self", "user_id": uid}]

    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=[], events=events, registrations=registrations)
    # 25 verification + 40 event hosting + 0 self-registration = 65
    assert res["score"] == 65
    assert res["breakdown"]["events"] == 40
    assert res["breakdown"]["registrations"] == 0
    assert res["activity_counts"]["valid_registrations"] == 0


# ------------------------------------------------------------
# 11. Duplicate registration cannot double-count
# ------------------------------------------------------------
def test_11_duplicate_registration_not_double_counted():
    uid = "test-alumni-11"
    user = _get_or_create_user(uid, "Alum 11", "alum11@test.com", "alumni", True, "approved")

    events = [{"id": "evt-11", "created_by": "other-user", "status": "approved"}]
    registrations = [
        {"id": "r1", "event_id": "evt-11", "user_id": uid},
        {"id": "r2", "event_id": "evt-11", "user_id": uid},
    ]

    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=[], events=events, registrations=registrations)
    assert res["score"] == 35  # 25 + 10 (only 1 valid counted)
    assert res["breakdown"]["registrations"] == 10
    assert res["activity_counts"]["valid_registrations"] == 1


# ------------------------------------------------------------
# 12. Registration for rejected/pending/cancelled event gives 0
# ------------------------------------------------------------
def test_12_registration_for_non_approved_event_gives_zero():
    uid = "test-alumni-12"
    user = _get_or_create_user(uid, "Alum 12", "alum12@test.com", "alumni", True, "approved")

    events = [
        {"id": "evt-p", "created_by": "other-user", "status": "pending"},
        {"id": "evt-r", "created_by": "other-user", "status": "rejected"},
        {"id": "evt-c", "created_by": "other-user", "status": "cancelled"},
    ]
    registrations = [
        {"id": "r1", "event_id": "evt-p", "user_id": uid},
        {"id": "r2", "event_id": "evt-r", "user_id": uid},
        {"id": "r3", "event_id": "evt-c", "user_id": uid},
        {"id": "r4", "event_id": "non-existent-event", "user_id": uid},
    ]

    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=[], events=events, registrations=registrations)
    assert res["score"] == 25
    assert res["breakdown"]["registrations"] == 0
    assert res["activity_counts"]["valid_registrations"] == 0


# ------------------------------------------------------------
# 13. Registration contribution caps at 100
# ------------------------------------------------------------
def test_13_registration_contribution_caps_at_100():
    uid = "test-alumni-13"
    user = _get_or_create_user(uid, "Alum 13", "alum13@test.com", "alumni", True, "approved")

    # 12 distinct approved external events
    events = [
        {"id": f"evt-{i}", "created_by": "other-user", "status": "approved"}
        for i in range(12)
    ]
    registrations = [
        {"id": f"reg-{i}", "event_id": f"evt-{i}", "user_id": uid}
        for i in range(12)
    ]

    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=[], events=events, registrations=registrations)
    # Verification (25) + Capped Registrations (100) = 125
    assert res["breakdown"]["registrations"] == 100
    assert res["score"] == 125
    assert res["activity_counts"]["valid_registrations"] == 12


# ------------------------------------------------------------
# 14. Multiple activities calculate correctly
# ------------------------------------------------------------
def test_14_multiple_activities_calculate_correctly():
    uid = "test-alumni-14"
    user = _get_or_create_user(uid, "Alum 14", "alum14@test.com", "alumni", True, "approved")

    jobs = [
        {"id": "j1", "posted_by": uid, "status": "approved"},
        {"id": "j2", "posted_by": uid, "status": "approved"},
        {"id": "j3", "posted_by": uid, "status": "pending"},
    ]
    events = [
        {"id": "e1", "created_by": uid, "status": "approved"},
        {"id": "e2", "created_by": "external", "status": "approved"},
        {"id": "e3", "created_by": "external", "status": "approved"},
    ]
    registrations = [
        {"id": "r1", "event_id": "e2", "user_id": uid},
        {"id": "r2", "event_id": "e3", "user_id": uid},
    ]

    res = aci_service.calculate_alumni_aci(uid, user_doc=user, jobs=jobs, events=events, registrations=registrations)
    # 25 (ver) + 100 (2 jobs) + 40 (1 event) + 20 (2 regs) = 185
    assert res["score"] == 185
    assert res["breakdown"]["verification"] == 25
    assert res["breakdown"]["jobs"] == 100
    assert res["breakdown"]["events"] == 40
    assert res["breakdown"]["registrations"] == 20
    assert res["tier"] == "Gold Contributor"
    assert res["badge"] == "🥇"


# ------------------------------------------------------------
# 15. Tier transitions are correct
# ------------------------------------------------------------
def test_15_tier_transitions():
    assert aci_service.get_tier_and_badge(0) == ("Bronze Contributor", "🥉")
    assert aci_service.get_tier_and_badge(49) == ("Bronze Contributor", "🥉")
    assert aci_service.get_tier_and_badge(50) == ("Silver Contributor", "🥈")
    assert aci_service.get_tier_and_badge(149) == ("Silver Contributor", "🥈")
    assert aci_service.get_tier_and_badge(150) == ("Gold Contributor", "🥇")
    assert aci_service.get_tier_and_badge(299) == ("Gold Contributor", "🥇")
    assert aci_service.get_tier_and_badge(300) == ("Platinum Contributor", "💎")
    assert aci_service.get_tier_and_badge(500) == ("Platinum Contributor", "💎")


# ------------------------------------------------------------
# 16. Student cannot access /alumni/me/aci
# ------------------------------------------------------------
def test_16_student_cannot_access_me_aci():
    _get_or_create_user("student-aci-test", "Student User", "stud@test.com", "student", True)
    token = create_access_token("student-aci-test", "student")
    res = client.get("/alumni/me/aci", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "Only alumni" in res.json().get("detail", "")


# ------------------------------------------------------------
# 17. Admin cannot access /alumni/me/aci
# ------------------------------------------------------------
def test_17_admin_cannot_access_me_aci():
    _get_or_create_user("admin-aci-test", "Admin User", "admin@test.com", "admin", True)
    token = create_access_token("admin-aci-test", "admin")
    res = client.get("/alumni/me/aci", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "Only alumni" in res.json().get("detail", "")


# ------------------------------------------------------------
# Unverified / Inactive Alumni cannot access /alumni/me/aci
# ------------------------------------------------------------
def test_unverified_alumni_cannot_access_me_aci():
    _get_or_create_user("unver-test-id", "Unverified Alum", "unver@test.com", "alumni", False, "pending")
    token = create_access_token("unver-test-id", "alumni")
    res = client.get("/alumni/me/aci", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "must be verified" in res.json().get("detail", "")


def test_inactive_alumni_cannot_access_me_aci():
    _get_or_create_user("inactive-test-id", "Inactive Alum", "inact@test.com", "alumni", True, "approved", is_active=False)
    token = create_access_token("inactive-test-id", "alumni")
    res = client.get("/alumni/me/aci", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "deactivated" in res.json().get("detail", "")


# ------------------------------------------------------------
# 18. Score changes automatically after an activity is removed/changed
# ------------------------------------------------------------
def test_18_dynamic_recalculation_after_changes(tmp_path):
    uid = "test-alumni-dynamic"
    _get_or_create_user(uid, "Dynamic Alum", "dyn@test.com", "alumni", True, "approved")
    token = create_access_token(uid, "alumni")
    headers = {"Authorization": f"Bearer {token}"}

    # Initial state: only verified (25 pts)
    res = client.get("/alumni/me/aci", headers=headers)
    assert res.status_code == 200
    assert res.json()["score"] == 25

    # Add an approved job to disk
    job = [{"id": "job-dyn-1", "posted_by": uid, "status": "approved"}]
    aci_service.JOBS_FILE.write_text(json.dumps(job), encoding="utf-8")

    # Score immediately reflects new job without any worker
    res = client.get("/alumni/me/aci", headers=headers)
    assert res.status_code == 200
    assert res.json()["score"] == 75

    # Change job to rejected on disk
    job[0]["status"] = "rejected"
    aci_service.JOBS_FILE.write_text(json.dumps(job), encoding="utf-8")

    # Score drops back to 25
    res = client.get("/alumni/me/aci", headers=headers)
    assert res.status_code == 200
    assert res.json()["score"] == 25


# ------------------------------------------------------------
# 19. Directory includes ACI fields for verified alumni
# ------------------------------------------------------------
def test_19_directory_includes_aci_fields():
    uid = "dir-alum-1"
    _get_or_create_user(uid, "Directory Alum 1", "dir1@test.com", "alumni", True, "approved")
    token = create_access_token(uid, "alumni")
    headers = {"Authorization": f"Bearer {token}"}

    # Write a job for this alumni
    job = [{"id": "j-dir", "posted_by": uid, "status": "approved"}]
    alumni_routes.JOBS_FILE.write_text(json.dumps(job), encoding="utf-8")

    res = client.get("/alumni/directory", headers=headers)
    assert res.status_code == 200
    items = res.json()
    assert len(items) > 0

    found = next((item for item in items if item["id"] == uid), None)
    assert found is not None
    assert "aci_score" in found
    assert "aci_tier" in found
    assert "aci_badge" in found
    assert found["aci_score"] == 75
    assert found["aci_tier"] == "Silver Contributor"
    assert found["aci_badge"] == "🥈"


# ------------------------------------------------------------
# 20. Directory sort_by=aci works without breaking existing behavior
# ------------------------------------------------------------
def test_20_directory_sort_by_aci():
    uid_low = "dir-alum-low"
    uid_high = "dir-alum-high"

    _get_or_create_user(uid_low, "Low Alum", "low@test.com", "alumni", True, "approved")
    _get_or_create_user(uid_high, "High Alum", "high@test.com", "alumni", True, "approved")

    token = create_access_token(uid_low, "alumni")
    headers = {"Authorization": f"Bearer {token}"}

    # High alumnus gets 2 approved jobs (25 + 100 = 125)
    # Low alumnus gets 0 jobs (25 pts)
    jobs = [
        {"id": "j-high-1", "posted_by": uid_high, "status": "approved"},
        {"id": "j-high-2", "posted_by": uid_high, "status": "approved"},
    ]
    alumni_routes.JOBS_FILE.write_text(json.dumps(jobs), encoding="utf-8")

    # 1. Unsorted call preserves normal behavior
    res_normal = client.get("/alumni/directory", headers=headers)
    assert res_normal.status_code == 200

    # 2. sort_by=aci orders descending by score
    res_sorted = client.get("/alumni/directory?sort_by=aci", headers=headers)
    assert res_sorted.status_code == 200
    sorted_items = res_sorted.json()

    # Find the positions of high and low
    high_idx = next(i for i, item in enumerate(sorted_items) if item["id"] == uid_high)
    low_idx = next(i for i, item in enumerate(sorted_items) if item["id"] == uid_low)
    assert high_idx < low_idx
    assert sorted_items[high_idx]["aci_score"] == 125
    assert sorted_items[low_idx]["aci_score"] == 25
