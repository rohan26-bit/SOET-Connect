"""API regression tests: data-store outages must not masquerade as empty feeds."""

import routes.admin as admin_module
import routes.alumni as alumni_module
import routes.announcements as announcements_module
import routes.applications as applications_module
import routes.events as events_module
import routes.gallery as gallery_module
import routes.jobs as jobs_module
import routes.notifications as notifications_module


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


def test_own_gallery_reports_database_read_failure(client, alumni_user, monkeypatch):
    _fail_table_read(monkeypatch, gallery_module, "gallery_photos")
    response = client.get("/api/gallery/mine", headers=alumni_user["headers"])
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


def test_alumni_aci_reports_database_read_failure(client, verified_alumni_user, monkeypatch):
    _fail_table_read(monkeypatch, alumni_module, "jobs")
    response = client.get("/api/alumni/me/aci", headers=verified_alumni_user["headers"])
    _assert_service_unavailable(response)
