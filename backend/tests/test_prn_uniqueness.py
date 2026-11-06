import pytest

from database import users_collection


def register_student(client, email: str, prn: str):
    return client.post("/auth/register", json={
        "name": "Test Student",
        "email": email,
        "password": "SecurePassword123!",
        "role": "student",
        "student_id": prn,
        "department": "Computer Engineering",
        "course": "B.Tech",
        "academic_year": "3rd Year",
        "graduation_year": "2027",
        "phone": "9876543210",
    })


def register_alumni(client, email: str, prn: str):
    return client.post("/auth/register", json={
        "name": "Test Alumni",
        "email": email,
        "password": "SecurePassword123!",
        "role": "alumni",
        "alumni_id": prn,
        "department": "Computer Engineering",
        "degree": "B.Tech",
        "graduation_year": "2022",
    })


def test_prn_availability_endpoint_reports_free_and_existing_values(client):
    free_response = client.get("/auth/check-prn", params={"prn": "202311116026"})
    assert free_response.status_code == 200
    assert free_response.json()["available"] is True

    assert register_student(client, "prn-owner@example.com", "202311116026").status_code == 201

    taken_response = client.get("/auth/check-prn", params={"prn": " 202311116026 "})
    assert taken_response.status_code == 200
    assert taken_response.json()["available"] is False
    assert "already associated" in taken_response.json()["message"].lower()


def test_duplicate_student_prn_is_rejected_before_creating_another_account(client):
    assert register_student(client, "student-prn-one@example.com", "STU-PRN-001").status_code == 201

    duplicate = register_student(client, "student-prn-two@example.com", " stu-prn-001 ")
    assert duplicate.status_code == 409
    assert "already associated" in duplicate.json()["detail"].lower()
    assert users_collection.find_one({"email": "student-prn-two@example.com"}) is None


def test_prn_is_unique_across_student_and_alumni_roles(client):
    assert register_student(client, "cross-role-student@example.com", "202311116022").status_code == 201

    duplicate_alumni = register_alumni(client, "cross-role-alumni@example.com", "202311116022")
    assert duplicate_alumni.status_code == 409
    assert users_collection.find_one({"email": "cross-role-alumni@example.com"}) is None


def test_student_registration_cannot_reuse_an_existing_alumni_prn(client):
    assert register_alumni(client, "alumni-owner@example.com", "202311116054").status_code == 201

    duplicate_student = register_student(client, "student-after-alumni@example.com", "202311116054")
    assert duplicate_student.status_code == 409
    assert users_collection.find_one({"email": "student-after-alumni@example.com"}) is None


def test_pending_or_rejected_account_keeps_its_prn_reserved(client):
    assert register_student(client, "rejected-prn-owner@example.com", "202311116099").status_code == 201
    users_collection.update_one(
        {"email": "rejected-prn-owner@example.com"},
        {"$set": {"is_verified": False, "verification_status": "rejected"}},
    )

    duplicate = register_alumni(client, "reusing-rejected-prn@example.com", "202311116099")
    assert duplicate.status_code == 409
    assert users_collection.find_one({"email": "reusing-rejected-prn@example.com"}) is None


def test_prn_comparison_ignores_case_and_surrounding_whitespace(client):
    assert register_student(client, "normalized-prn@example.com", "stu-prn-xyz").status_code == 201

    check = client.get("/auth/check-prn", params={"prn": " STU-PRN-XYZ "})
    assert check.status_code == 200
    assert check.json()["available"] is False
    assert register_alumni(client, "normalized-alumni@example.com", "STU-PRN-XYZ").status_code == 409


@pytest.mark.parametrize("role,prn", [("student", ""), ("alumni", "")])
def test_check_prn_endpoint_requires_a_non_empty_prn(client, role, prn):
    response = client.get("/auth/check-prn", params={"prn": prn})
    assert response.status_code == 422
