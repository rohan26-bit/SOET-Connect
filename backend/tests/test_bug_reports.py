import pytest
from fastapi import status


def test_submit_bug_report_by_student(client, student_user):
    payload = {
        "category": "bug",
        "severity": "high",
        "subject": "Button does not respond on click",
        "description": "Clicking the submit button on the application form does nothing.",
        "page_route": "/student/jobs",
        "reproduction_steps": "1. Go to jobs\n2. Click apply\n3. Click submit"
    }

    resp = client.post("/api/bug-reports", json=payload, headers=student_user["headers"])
    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["message"] == "Report submitted successfully."
    assert "report" in data
    report = data["report"]
    assert report["subject"] == payload["subject"]
    assert report["category"] == "bug"
    assert report["severity"] == "high"
    assert report["status"] == "open"
    assert report["reporter"]["name"] == student_user["name"]


def test_submit_bug_report_by_alumni(client, verified_alumni_user):
    payload = {
        "category": "ui_issue",
        "severity": "low",
        "subject": "Misaligned text in achievements card",
        "description": "The achievement card title overlaps with badge on small screens.",
        "page_route": "/alumni/achievements",
    }

    resp = client.post("/api/bug-reports", json=payload, headers=verified_alumni_user["headers"])
    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["report"]["severity"] == "low"
    assert data["report"]["reporter"]["role"] == "alumni"


def test_submit_bug_report_unauthenticated(client):
    payload = {
        "category": "bug",
        "severity": "medium",
        "subject": "Cannot see navbar",
        "description": "The navbar is invisible on the landing page."
    }

    resp = client.post("/api/bug-reports", json=payload)
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_submit_bug_report_validation_errors(client, student_user):
    # Invalid category
    resp = client.post("/api/bug-reports", json={
        "category": "invalid_cat",
        "severity": "medium",
        "subject": "Test subject",
        "description": "Test description text here."
    }, headers=student_user["headers"])
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # Invalid severity
    resp = client.post("/api/bug-reports", json={
        "category": "bug",
        "severity": "ultra_high",
        "subject": "Test subject",
        "description": "Test description text here."
    }, headers=student_user["headers"])
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # Subject too short
    resp = client.post("/api/bug-reports", json={
        "category": "bug",
        "severity": "medium",
        "subject": "ab",
        "description": "Test description text here."
    }, headers=student_user["headers"])
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # Description too short
    resp = client.post("/api/bug-reports", json={
        "category": "bug",
        "severity": "medium",
        "subject": "Valid Subject",
        "description": "tiny"
    }, headers=student_user["headers"])
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_list_bug_reports_as_admin(client, admin_user, student_user):
    # Student submits report
    client.post("/api/bug-reports", json={
        "category": "performance",
        "severity": "medium",
        "subject": "Slow chat loading",
        "description": "Messages take 10 seconds to render."
    }, headers=student_user["headers"])

    # Admin lists reports
    resp = client.get("/api/bug-reports", headers=admin_user["headers"])
    assert resp.status_code == status.HTTP_200_OK
    reports = resp.json()
    assert len(reports) >= 1
    assert reports[0]["subject"] == "Slow chat loading"
    assert reports[0]["reporter"]["email"] == student_user["email"]


def test_list_bug_reports_forbidden_for_non_admin(client, student_user, verified_alumni_user):
    resp = client.get("/api/bug-reports", headers=student_user["headers"])
    assert resp.status_code == status.HTTP_403_FORBIDDEN

    resp = client.get("/api/bug-reports", headers=verified_alumni_user["headers"])
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_get_bug_report_by_id(client, admin_user, student_user, other_student_user):
    submit_resp = client.post("/api/bug-reports", json={
        "category": "data_issue",
        "severity": "high",
        "subject": "Profile not saving graduation year",
        "description": "Whenever I enter 2026 it reverts to empty."
    }, headers=student_user["headers"])
    report_id = submit_resp.json()["report"]["id"]

    # Original reporter can view
    resp = client.get(f"/api/bug-reports/{report_id}", headers=student_user["headers"])
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["id"] == report_id

    # Admin can view
    resp = client.get(f"/api/bug-reports/{report_id}", headers=admin_user["headers"])
    assert resp.status_code == status.HTTP_200_OK

    # Other student cannot view
    resp = client.get(f"/api/bug-reports/{report_id}", headers=other_student_user["headers"])
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_update_bug_report_status_as_admin(client, admin_user, student_user):
    submit_resp = client.post("/api/bug-reports", json={
        "category": "bug",
        "severity": "critical",
        "subject": "Login error on Safari",
        "description": "Cannot log in using Safari 17 on iOS."
    }, headers=student_user["headers"])
    report_id = submit_resp.json()["report"]["id"]

    # Admin updates status
    patch_resp = client.patch(
        f"/api/bug-reports/{report_id}/status",
        json={"status": "in_review", "admin_notes": "Assigned to backend team."},
        headers=admin_user["headers"]
    )
    assert patch_resp.status_code == status.HTTP_200_OK
    updated = patch_resp.json()["report"]
    assert updated["status"] == "in_review"
    assert updated["admin_notes"] == "Assigned to backend team."

    # Mark resolved
    patch_resp2 = client.patch(
        f"/api/bug-reports/{report_id}/status",
        json={"status": "resolved", "admin_notes": "Fixed in patch v1.2."},
        headers=admin_user["headers"]
    )
    assert patch_resp2.status_code == status.HTTP_200_OK
    assert patch_resp2.json()["report"]["status"] == "resolved"


def test_update_bug_report_status_forbidden_for_student(client, student_user):
    submit_resp = client.post("/api/bug-reports", json={
        "category": "other",
        "severity": "low",
        "subject": "Typo in footer link",
        "description": "There is a typo on the alumni directory footer."
    }, headers=student_user["headers"])
    report_id = submit_resp.json()["report"]["id"]

    patch_resp = client.patch(
        f"/api/bug-reports/{report_id}/status",
        json={"status": "resolved"},
        headers=student_user["headers"]
    )
    assert patch_resp.status_code == status.HTTP_403_FORBIDDEN


def test_health_check_endpoint(client):
    resp = client.get("/api/health")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["api"] == "healthy"
    assert "database" in data
    assert "environment" in data
