def test_get_my_profile_student(client, student_user):
    """Student can retrieve their own profile."""
    res = client.get("/profile/me", headers=student_user["headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == student_user["id"]
    assert data["role"] == "student"
    assert "student_profile" in data
    assert data["student_profile"]["department"] == "Computer Science"


def test_get_my_profile_alumni(client, verified_alumni_user):
    """Alumni can retrieve their own profile including alumni details."""
    res = client.get("/profile/me", headers=verified_alumni_user["headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == verified_alumni_user["id"]
    assert data["role"] == "alumni"
    assert "alumni_profile" in data
    assert data["alumni_profile"]["company"] == "Tech Corp"


def test_update_student_profile(client, student_user):
    """Student can update their own profile fields."""
    update_payload = {
        "full_name": "Updated Student Name",
        "phone": "9991112233",
        "course": "B.Tech CSE"
    }
    res = client.patch("/profile/me", json=update_payload, headers=student_user["headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["message"] == "Profile updated successfully."
    assert data["profile"]["name"] == "Updated Student Name"
    assert data["profile"]["student_profile"]["phone"] == "9991112233"
    assert data["profile"]["student_profile"]["course"] == "B.Tech CSE"


def test_update_alumni_profile(client, verified_alumni_user):
    """Alumni can update their career details."""
    update_payload = {
        "company": "NextGen AI",
        "designation": "Staff Engineer",
        "bio": "Building cutting edge AI systems."
    }
    res = client.patch("/profile/me", json=update_payload, headers=verified_alumni_user["headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["message"] == "Profile updated successfully."
    assert data["profile"]["alumni_profile"]["company"] == "NextGen AI"
    assert data["profile"]["alumni_profile"]["designation"] == "Staff Engineer"
    assert data["profile"]["alumni_profile"]["bio"] == "Building cutting edge AI systems."


def test_update_profile_empty_body_fails(client, student_user):
    """Sending an empty update body returns 400 Bad Request."""
    res = client.patch("/profile/me", json={}, headers=student_user["headers"])
    assert res.status_code == 400
    assert "No profile changes were provided" in res.json().get("detail", "")


def test_update_profile_empty_name_fails(client, student_user):
    """Sending an empty whitespace full_name returns 400 Bad Request."""
    res = client.patch("/profile/me", json={"full_name": "   "}, headers=student_user["headers"])
    assert res.status_code == 400
    assert "Full name cannot be empty" in res.json().get("detail", "")


def test_profile_ownership_isolation(client, student_user, other_student_user):
    """Updating one user's profile does not affect another user's profile."""
    client.patch("/profile/me", json={"full_name": "New Name Student 1"}, headers=student_user["headers"])

    # Other student checks their own profile
    res2 = client.get("/profile/me", headers=other_student_user["headers"])
    assert res2.status_code == 200
    assert res2.json()["name"] == other_student_user["name"]
