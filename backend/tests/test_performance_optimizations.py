import os
import uuid
import pytest
from database import users_collection, supabase
from database_supabase import MockQueryBuilder, _mock_store
from routes.admin import get_dashboard_metrics
from routes.jobs import load_jobs
from routes.events import load_events, load_registrations
from security.dependencies import get_user_by_id


def test_mock_query_builder_exact_count():
    """Verify that MockQueryBuilder computes exact count when count='exact' is specified."""
    _mock_store["test_items"] = [
        {"id": "1", "status": "active"},
        {"id": "2", "status": "active"},
        {"id": "3", "status": "inactive"},
    ]
    builder = MockQueryBuilder("test_items")
    res = builder.select("id", count="exact").eq("status", "active").execute()
    assert res.count == 2
    assert len(res.data) == 2

    # With limit, count should reflect total matched rows, not sliced length
    res_limited = MockQueryBuilder("test_items").select("id", count="exact").eq("status", "active").limit(1).execute()
    assert res_limited.count == 2
    assert len(res_limited.data) == 1

    # Count helper method
    assert MockQueryBuilder("test_items").eq("status", "active").count() == 2
    assert MockQueryBuilder("test_items").eq("status", "inactive").count() == 1


def test_users_collection_lightweight_mode():
    """Verify that include_profiles=False retrieves user accounts without profile queries."""
    uid = str(uuid.uuid4())
    user_doc = {
        "_id": uid,
        "id": uid,
        "name": "Lightweight User",
        "email": "lightweight@example.com",
        "role": "student",
        "is_active": True,
        "is_verified": True,
        "verification_status": "approved",
    }
    users_collection.insert_one(user_doc)

    # find_one with include_profiles=False
    found = users_collection.find_one({"_id": uid}, include_profiles=False)
    assert found is not None
    assert found["email"] == "lightweight@example.com"
    assert found.get("student_profile") == {}

    # find with include_profiles=False
    all_users = users_collection.find({"role": "student"}, include_profiles=False)
    target = [u for u in all_users if u["id"] == uid]
    assert len(target) == 1
    assert target[0].get("student_profile") == {}


def test_users_collection_batch_profile_resolution():
    """Verify that find(include_profiles=True) batch-hydrates linked profiles."""
    s_id = str(uuid.uuid4())
    a_id = str(uuid.uuid4())

    users_collection.insert_one({
        "_id": s_id,
        "id": s_id,
        "name": "Student Batch",
        "email": "student_batch@example.com",
        "role": "student",
        "is_active": True,
        "student_profile": {
            "department": "Civil Engineering",
            "course": "B.Tech",
        },
    })

    users_collection.insert_one({
        "_id": a_id,
        "id": a_id,
        "name": "Alumni Batch",
        "email": "alumni_batch@example.com",
        "role": "alumni",
        "is_active": True,
        "alumni_profile": {
            "company": "Big Tech Corp",
            "designation": "Principal Engineer",
        },
    })

    found_users = users_collection.find({"is_active": True}, include_profiles=True)
    found_map = {u["id"]: u for u in found_users}

    assert s_id in found_map
    assert found_map[s_id]["student_profile"]["department"] == "Civil Engineering"

    assert a_id in found_map
    assert found_map[a_id]["alumni_profile"]["company"] == "Big Tech Corp"


def test_job_and_event_db_level_filtering():
    """Verify load_jobs and load_events filter on the database level."""
    # Insert jobs
    jid1 = str(uuid.uuid4())
    jid2 = str(uuid.uuid4())
    u1 = str(uuid.uuid4())
    u2 = str(uuid.uuid4())

    supabase.table("jobs").insert([
        {"id": jid1, "title": "Job 1", "posted_by": u1, "status": "approved", "job_type": "Full-time"},
        {"id": jid2, "title": "Job 2", "posted_by": u2, "status": "pending", "job_type": "Internship"},
    ]).execute()

    approved = load_jobs(status="approved")
    approved_ids = [j["id"] for j in approved]
    assert jid1 in approved_ids
    assert jid2 not in approved_ids

    user1_jobs = load_jobs(posted_by=u1)
    assert len(user1_jobs) == 1
    assert user1_jobs[0]["id"] == jid1

    # Insert events
    eid1 = str(uuid.uuid4())
    eid2 = str(uuid.uuid4())

    supabase.table("events").insert([
        {"id": eid1, "title": "Event 1", "created_by": u1, "status": "approved", "date": "2026-11-01"},
        {"id": eid2, "title": "Event 2", "created_by": u2, "status": "pending", "date": "2026-11-02"},
    ]).execute()

    user1_events = load_events(created_by=u1)
    assert len(user1_events) == 1
    assert user1_events[0]["id"] == eid1


def test_get_dashboard_metrics_accuracy():
    """Verify get_dashboard_metrics returns correct tallies using optimized concurrent queries."""
    # Create sample students and alumni
    s_id = str(uuid.uuid4())
    a_id = str(uuid.uuid4())

    users_collection.insert_one({
        "_id": s_id,
        "id": s_id,
        "name": "Metrics Student",
        "email": "m_student@example.com",
        "role": "student",
        "is_active": True,
        "is_verified": False,
        "verification_status": "pending",
    })

    users_collection.insert_one({
        "_id": a_id,
        "id": a_id,
        "name": "Metrics Alumni",
        "email": "m_alumni@example.com",
        "role": "alumni",
        "is_active": True,
        "is_verified": True,
        "verification_status": "approved",
    })

    metrics = get_dashboard_metrics(current_user={"role": "admin", "user_id": "admin-1"})
    assert metrics["totalStudents"] >= 1
    assert metrics["pendingStudents"] >= 1
    assert metrics["totalAlumni"] >= 1
    assert metrics["verifiedAlumni"] >= 1

