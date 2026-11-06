import pytest
from database import (
    get_database_config,
    DATABASE_BACKEND,
    DATABASE_MODE,
    test_database_connection as check_db_conn,
)
from database_supabase import get_supabase_config


def test_database_backend_is_supabase():
    """Verify that Supabase PostgreSQL is the active database backend."""
    assert DATABASE_BACKEND == "supabase"


def test_database_config_structure():
    """Verify get_database_config returns valid Supabase configuration."""
    config = get_database_config()
    assert config["backend"] == "supabase"
    assert "url" in config
    assert "service_role_key" in config
    assert "rest_url" in config
    assert "auth_url" in config
    assert config["rest_url"].endswith("/rest/v1")


def test_supabase_connection_in_mock_mode():
    """Verify test_database_connection succeeds in mock mode."""
    assert check_db_conn() is True


def test_url_and_key_sanitization(monkeypatch):
    """Verify that quotes and whitespace are properly stripped from environment variables."""
    monkeypatch.setenv("SUPABASE_URL", ' "https://test-project.supabase.co" ')
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", " 'test-key' ")
    cfg = get_supabase_config()
    assert cfg["url"] == "https://test-project.supabase.co"
    assert cfg["service_role_key"] == "test-key"


def test_supabase_query_builder_supports_range_and_or_filters():
    """Verify pagination and combined search filters map to PostgREST query parameters."""
    from database_supabase import SupabaseQueryBuilder

    query = SupabaseQueryBuilder("placement_celebrations")
    assert query.range(24, 35) is query
    assert query.params["offset"] == "24"
    assert query.params["limit"] == "12"

    query.or_("alumni_name.ilike.%Rohan%,company_name.ilike.%Rohan%")
    assert query.params["or"] == "(alumni_name.ilike.%Rohan%,company_name.ilike.%Rohan%)"


def test_chat_storage_bucket_initializer_handles_supabase_no_such_bucket_400(monkeypatch):
    """Supabase Storage returns 400/NoSuchBucket for a missing bucket on this project."""
    from database_supabase import CHAT_ATTACHMENT_BUCKET, SupabaseStorageBucket

    class FakeResponse:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload
            self.text = __import__("json").dumps(payload)
            self.is_success = 200 <= status_code < 300

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self):
            self.get_calls = []
            self.post_calls = []

        def get(self, url, headers=None):
            self.get_calls.append((url, headers))
            if len(self.get_calls) == 1:
                return FakeResponse(
                    400,
                    {
                        "statusCode": "404",
                        "error": "Bucket not found",
                        "message": "Bucket not found",
                        "code": "NoSuchBucket",
                    },
                )
            return FakeResponse(200, {"id": CHAT_ATTACHMENT_BUCKET})

        def post(self, url, headers=None, json=None):
            self.post_calls.append((url, headers, json))
            return FakeResponse(200, {"name": CHAT_ATTACHMENT_BUCKET})

    fake_client = FakeClient()
    monkeypatch.setattr(
        "database_supabase.get_http_client",
        lambda timeout=10.0: fake_client,
    )
    SupabaseStorageBucket._ensured_storage_buckets.discard(CHAT_ATTACHMENT_BUCKET)

    try:
        bucket = SupabaseStorageBucket(CHAT_ATTACHMENT_BUCKET)
        bucket._ensure_chat_bucket()

        assert len(fake_client.get_calls) == 1
        assert len(fake_client.post_calls) == 1
        created_bucket = fake_client.post_calls[0][2]
        assert created_bucket["id"] == CHAT_ATTACHMENT_BUCKET
        assert created_bucket["public"] is False
        assert created_bucket["file_size_limit"] == 10 * 1024 * 1024
        assert CHAT_ATTACHMENT_BUCKET in SupabaseStorageBucket._ensured_storage_buckets
    finally:
        SupabaseStorageBucket._ensured_storage_buckets.discard(CHAT_ATTACHMENT_BUCKET)
