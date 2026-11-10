"""API regression tests: data-store outages must not masquerade as empty feeds."""

from types import SimpleNamespace

import routes.admin as admin_module
import routes.alumni as alumni_module
import routes.announcements as announcements_module
import routes.applications as applications_module
import routes.events as events_module
import routes.gallery as gallery_module
import routes.jobs as jobs_module
import routes.notifications as notifications_module
import services.aci as aci_module


def _fail_table_read(monkeypatch, module, table_name: str):
    """Make one Supabase table unavailable while leaving all other reads intact."""
    original_table = module.supabase.table

    def table(name: str):
        if name == table_name:
            raise RuntimeError(f"simulated {table_name} read outage")
        return original_table(name)

    monkeypatch.setattr(module.supabase, "table", table)


def _assert_service_unavailable(response):
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"].lower()


def test_jobs_feed_reports_database_read_failure(client, student_user, monkeypatch):
    _fail_table_read(monkeypatch, jobs_module, "jobs")
    response = client.get("/jobs", headers=student_user["headers"])
    _assert_service_unavailable(response)


def test_events_feed_reports_database_read_failure(client, student_user, monkeypatch):
    _fail_table_read(monkeypatch, events_module, "events")
    response = client.get("/events", headers=student_user["headers"])
    _assert_service_unavailable(response)


def test_event_registration_counts_report_database_read_failure(client, student_user, monkeypatch):
    _fail_table_read(monkeypatch, events_module, "event_registrations")
    response = client.get("/events", headers=student_user["headers"])
    _assert_service_unavailable(response)


def test_announcements_feed_reports_database_read_failure(client, student_user, monkeypatch):
    _fail_table_read(monkeypatch, announcements_module, "announcements")
    response = client.get("/announcements", headers=student_user["headers"])
    _assert_service_unavailable(response)


def test_own_applications_reports_database_read_failure(client, student_user, monkeypatch):
    _fail_table_read(monkeypatch, applications_module, "job_applications")
    response = client.get("/applications/me", headers=student_user["headers"])
    _assert_service_unavailable(response)


def test_public_gallery_reports_database_read_failure(client, monkeypatch):
    _fail_table_read(monkeypatch, gallery_module, "gallery_photos")
    response = client.get("/api/gallery")
    _assert_service_unavailable(response)


def test_own_gallery_reports_database_read_failure(client, verified_alumni_user, monkeypatch):
    _fail_table_read(monkeypatch, gallery_module, "gallery_photos")
    response = client.get("/api/gallery/mine", headers=verified_alumni_user["headers"])
    _assert_service_unavailable(response)


def test_notifications_feed_reports_database_read_failure(client, student_user, monkeypatch):
    _fail_table_read(monkeypatch, notifications_module, "notifications")
    response = client.get("/api/notifications", headers=student_user["headers"])
    _assert_service_unavailable(response)


def test_notification_delivery_history_reports_database_read_failure(client, student_user, monkeypatch):
    _fail_table_read(monkeypatch, notifications_module, "notification_deliveries")
    response = client.get("/api/notifications/deliveries", headers=student_user["headers"])
    _assert_service_unavailable(response)


def test_admin_metrics_report_database_read_failure(client, admin_user, monkeypatch):
    _fail_table_read(monkeypatch, admin_module, "jobs")
    response = client.get("/api/admin/metrics", headers=admin_user["headers"])
    _assert_service_unavailable(response)


def test_alumni_aci_reports_database_read_failure(client, verified_alumni_user, monkeypatch, tmp_path):
    # The legacy fixtures in this repository contain sample rows. Use empty
    # compatibility files so this test exercises the Supabase read path.
    for attribute, filename in (
        ("JOBS_FILE", "jobs_data.json"),
        ("EVENTS_FILE", "events_data.json"),
        ("REGISTRATIONS_FILE", "event_registrations_data.json"),
    ):
        path = tmp_path / filename
        path.write_text("[]", encoding="utf-8")
        monkeypatch.setattr(aci_module, attribute, path)

    _fail_table_read(monkeypatch, alumni_module, "jobs")
    response = client.get("/api/alumni/me/aci", headers=verified_alumni_user["headers"])
    _assert_service_unavailable(response)


def test_personal_aci_uses_supabase_in_production_even_with_legacy_json(monkeypatch, tmp_path):
    """Production ACI must ignore populated legacy JSON files and read Supabase."""
    monkeypatch.setenv("DATABASE_MODE", "supabase")
    stale_job = [{
        "id": "legacy-job",
        "posted_by": "aci-user",
        "status": "approved",
    }]
    jobs_file = tmp_path / "jobs_data.json"
    jobs_file.write_text(__import__("json").dumps(stale_job), encoding="utf-8")
    events_file = tmp_path / "events_data.json"
    events_file.write_text("[]", encoding="utf-8")
    registrations_file = tmp_path / "event_registrations_data.json"
    registrations_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr(aci_module, "JOBS_FILE", jobs_file)
    monkeypatch.setattr(aci_module, "EVENTS_FILE", events_file)
    monkeypatch.setattr(aci_module, "REGISTRATIONS_FILE", registrations_file)

    queried_tables = []

    class StubQuery:
        def __init__(self, table_name):
            self.table_name = table_name

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def in_(self, *_args, **_kwargs):
            return self

        def execute(self):
            queried_tables.append(self.table_name)
            return SimpleNamespace(data=[])

    monkeypatch.setattr(
        aci_module.supabase,
        "table",
        lambda table_name: StubQuery(table_name),
    )

    result = aci_module.calculate_alumni_aci(
        "aci-user",
        user_doc={
            "_id": "aci-user",
            "is_active": True,
            "is_verified": True,
            "verification_status": "approved",
        },
    )

    assert result["breakdown"]["jobs"] == 0
    assert result["score"] == 25
    assert {"jobs", "events", "event_registrations"}.issubset(set(queried_tables))

def test_mark_notification_read_reports_database_read_failure(client, student_user, monkeypatch):
    _fail_table_read(monkeypatch, notifications_module, "notifications")
    response = client.patch(
        "/api/notifications/not-a-real-id/read",
        headers=student_user["headers"],
    )
    _assert_service_unavailable(response)


def test_mark_all_notifications_read_reports_database_read_failure(client, student_user, monkeypatch):
    _fail_table_read(monkeypatch, notifications_module, "notifications")
    response = client.patch(
        "/api/notifications/read-all",
        headers=student_user["headers"],
    )
    _assert_service_unavailable(response)

