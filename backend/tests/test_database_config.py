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
