from fastapi.testclient import TestClient


def test_placement_management_is_admin_only(
    client: TestClient,
    student_user: dict,
    verified_alumni_user: dict,
):
    """Only admins can read the admin feed or create, update, and delete placement records."""
    payload = {
        "alumni_name": "Test Alumni",
        "company_name": "Example Technologies",
        "photo_consent": True,
        "is_published": False,
    }

    assert client.get("/api/placements/admin").status_code == 401
    assert client.post("/api/placements", json=payload).status_code == 401

    for user in (student_user, verified_alumni_user):
        headers = user["headers"]
        assert client.get("/api/placements/admin", headers=headers).status_code == 403
        assert client.post("/api/placements", json=payload, headers=headers).status_code == 403
        assert client.patch(
            "/api/placements/00000000-0000-0000-0000-000000000001",
            json={"is_published": True},
            headers=headers,
        ).status_code == 403
        assert client.delete(
            "/api/placements/00000000-0000-0000-0000-000000000001",
            headers=headers,
        ).status_code == 403


def test_published_placement_requires_photo_consent(
    client: TestClient,
    admin_user: dict,
):
    """An admin cannot publish a story unless alumnus photo/details consent is confirmed."""
    response = client.post(
        "/api/placements",
        headers=admin_user["headers"],
        json={
            "alumni_name": "Test Alumni",
            "company_name": "Example Technologies",
            "photo_consent": False,
            "is_published": True,
        },
    )
    assert response.status_code == 400
    assert "permission" in response.json()["detail"].lower()


def test_public_placement_feed_only_queries_published_rows(
    client: TestClient,
    monkeypatch,
):
    """The public, unauthenticated homepage feed selects safe fields and filters to published rows."""
    observed = {
        "table": None,
        "selected": None,
        "count": None,
        "filters": [],
        "search_expression": None,
        "range": None,
    }

    class FakeQuery:
        def select(self, columns, count=None):
            observed["selected"] = columns
            observed["count"] = count
            return self

        def eq(self, column, value):
            observed["filters"].append((column, value))
            return self

        def or_(self, expression):
            observed["search_expression"] = expression
            return self

        def order(self, column, desc=False):
            return self

        def range(self, start, end):
            observed["range"] = (start, end)
            return self

        def execute(self):
            class Result:
                data = [{
                    "id": "placement-1",
                    "alumni_name": "Public Alumni",
                    "company_name": "Yardi Systems",
                    "photo_url": "/api/gallery/photo-1/image",
                    "photo_consent": True,
                    "is_published": True,
                }]
                count = 105
            return Result()

    def fake_table(table_name):
        observed["table"] = table_name
        return FakeQuery()

    monkeypatch.setattr("routes.placements.supabase.table", fake_table)

    response = client.get("/api/placements?limit=6&offset=12&search=Yardi")
    assert response.status_code == 200
    assert response.json()[0]["alumni_name"] == "Public Alumni"
    assert response.headers["X-Total-Count"] == "105"
    assert observed["table"] == "placement_celebrations"
    assert observed["count"] == "exact"
    assert observed["range"] == (12, 17)
    assert "company_name.ilike.%Yardi%" in observed["search_expression"]
    assert ("is_published", True) in observed["filters"]
    assert "photo_consent" not in observed["selected"]
    assert "created_by" not in observed["selected"]
    assert "is_published" not in observed["selected"]


def test_published_placement_requires_a_photo(
    client: TestClient,
    admin_user: dict,
):
    """Even an admin must attach an alumnus photo before publishing a placement story."""
    response = client.post(
        "/api/placements",
        headers=admin_user["headers"],
        json={
            "alumni_name": "Test Alumni",
            "company_name": "Example Technologies",
            "photo_consent": True,
            "is_published": True,
        },
    )
    assert response.status_code == 400
    assert "photo is required" in response.json()["detail"].lower()
