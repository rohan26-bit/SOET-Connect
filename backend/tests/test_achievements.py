from database import supabase


def _achievement_payload(**overrides):
    payload = {
        "title": "National Hackathon Winner",
        "description": "Won the national-level innovation challenge.",
        "category": "award",
        "achievement_date": "Nov 2024",
        "issuing_organization": "National Innovation Council",
        "credential_name": "NH-2024-01",
        "credential_url": "https://example.com/credential/NH-2024-01",
        "image_url": None,
        "visibility": "public",
    }
    payload.update(overrides)
    return payload


def _list_owned_achievements(user_id):
    return (
        supabase.table("achievements")
        .select("*")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )


def test_verified_alumni_can_create_and_retrieve_persistent_achievements(client, verified_alumni_user):
    response = client.post(
        "/api/alumni/me/achievements",
        headers=verified_alumni_user["headers"],
        json=_achievement_payload(),
    )

    assert response.status_code == 201
    created = response.json()
    assert created["title"] == "National Hackathon Winner"
    assert created["achievement_date"] == "Nov 2024"
    assert created["visibility"] == "public"
    assert created["credential_name"] == "NH-2024-01"
    assert "user_id" not in created

    stored = _list_owned_achievements(verified_alumni_user["id"])
    assert len(stored) == 1
    assert stored[0]["achievement_date"] == "2024-11-01"

    fetched = client.get(
        "/api/alumni/me/achievements",
        headers=verified_alumni_user["headers"],
    )
    assert fetched.status_code == 200
    assert len(fetched.json()) == 1
    assert fetched.json()[0]["id"] == created["id"]


def test_achievement_date_accepts_year_and_full_date_formats(client, verified_alumni_user):
    year_only = client.post(
        "/api/alumni/me/achievements",
        headers=verified_alumni_user["headers"],
        json=_achievement_payload(title="Graduation Award", achievement_date="2022"),
    )
    exact_date = client.post(
        "/api/alumni/me/achievements",
        headers=verified_alumni_user["headers"],
        json=_achievement_payload(title="Published Research", category="publication", achievement_date="2023-06-17"),
    )

    assert year_only.status_code == 201
    assert year_only.json()["achievement_date"] == "2022"
    assert exact_date.status_code == 201
    assert exact_date.json()["achievement_date"] == "2023-06-17"


def test_invalid_achievement_date_and_urls_are_rejected(client, verified_alumni_user):
    invalid_date = client.post(
        "/api/alumni/me/achievements",
        headers=verified_alumni_user["headers"],
        json=_achievement_payload(achievement_date="sometime in 2024"),
    )
    invalid_url = client.post(
        "/api/alumni/me/achievements",
        headers=verified_alumni_user["headers"],
        json=_achievement_payload(credential_url="javascript:alert(1)"),
    )

    assert invalid_date.status_code == 422
    assert invalid_url.status_code == 422


def test_students_and_unverified_alumni_cannot_manage_achievements(client, student_user, unverified_alumni_user):
    student_create = client.post(
        "/api/alumni/me/achievements",
        headers=student_user["headers"],
        json=_achievement_payload(),
    )
    pending_create = client.post(
        "/api/alumni/me/achievements",
        headers=unverified_alumni_user["headers"],
        json=_achievement_payload(),
    )

    assert student_create.status_code == 403
    assert pending_create.status_code == 403


def test_achievement_update_and_delete_are_owner_scoped(client, verified_alumni_user, other_alumni_user):
    created = client.post(
        "/api/alumni/me/achievements",
        headers=verified_alumni_user["headers"],
        json=_achievement_payload(visibility="private"),
    )
    assert created.status_code == 201
    achievement_id = created.json()["id"]

    foreign_update = client.patch(
        f"/api/alumni/me/achievements/{achievement_id}",
        headers=other_alumni_user["headers"],
        json={"title": "Attempted takeover"},
    )
    assert foreign_update.status_code == 404
    assert _list_owned_achievements(verified_alumni_user["id"])[0]["title"] == "National Hackathon Winner"

    owner_update = client.patch(
        f"/api/alumni/me/achievements/{achievement_id}",
        headers=verified_alumni_user["headers"],
        json={
            "title": "Updated National Hackathon Winner",
            "credential_name": None,
            "visibility": "alumni_only",
        },
    )
    assert owner_update.status_code == 200
    assert owner_update.json()["title"] == "Updated National Hackathon Winner"
    assert owner_update.json()["credential_name"] is None
    assert owner_update.json()["visibility"] == "alumni_only"

    foreign_delete = client.delete(
        f"/api/alumni/me/achievements/{achievement_id}",
        headers=other_alumni_user["headers"],
    )
    assert foreign_delete.status_code == 404
    assert len(_list_owned_achievements(verified_alumni_user["id"])) == 1

    owner_delete = client.delete(
        f"/api/alumni/me/achievements/{achievement_id}",
        headers=verified_alumni_user["headers"],
    )
    assert owner_delete.status_code == 204
    assert _list_owned_achievements(verified_alumni_user["id"]) == []


def test_achievement_visibility_is_respected_for_other_profiles(
    client,
    verified_alumni_user,
    other_alumni_user,
    student_user,
):
    for title, visibility in [
        ("Public achievement", "public"),
        ("Alumni-only achievement", "alumni_only"),
        ("Private achievement", "private"),
    ]:
        response = client.post(
            "/api/alumni/me/achievements",
            headers=verified_alumni_user["headers"],
            json=_achievement_payload(title=title, visibility=visibility),
        )
        assert response.status_code == 201

    student_view = client.get(
        f"/api/alumni/directory/{verified_alumni_user['id']}/achievements",
        headers=student_user["headers"],
    )
    alumni_view = client.get(
        f"/api/alumni/directory/{verified_alumni_user['id']}/achievements",
        headers=other_alumni_user["headers"],
    )
    owner_view = client.get(
        f"/api/alumni/directory/{verified_alumni_user['id']}/achievements",
        headers=verified_alumni_user["headers"],
    )

    assert [item["title"] for item in student_view.json()] == ["Public achievement"]
    assert {item["title"] for item in alumni_view.json()} == {
        "Public achievement",
        "Alumni-only achievement",
    }
    assert {item["title"] for item in owner_view.json()} == {
        "Public achievement",
        "Alumni-only achievement",
        "Private achievement",
    }
