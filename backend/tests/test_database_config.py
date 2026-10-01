import pytest
import mongomock
from database import get_database_config, client, DATABASE_MODE


def test_conftest_guarantees_mock_database():
    """Verify that the test suite always runs against mongomock and never real Atlas."""
    assert DATABASE_MODE == "mock"
    assert isinstance(client, mongomock.MongoClient)


def test_database_config_mock_mode(monkeypatch):
    """In mock mode, get_database_config returns mock configuration without requiring a real URL."""
    monkeypatch.setenv("DATABASE_MODE", "mock")
    monkeypatch.setenv("DATABASE_NAME", "custom_test_db")

    config = get_database_config()
    assert config["mode"] == "mock"
    assert config["database_name"] == "custom_test_db"
    assert config["mongodb_url"] is None


def test_database_config_mock_mode_default_name(monkeypatch):
    """In mock mode with no DB name set, default to soet_connect_test."""
    monkeypatch.setenv("DATABASE_MODE", "mock")
    monkeypatch.setenv("DATABASE_NAME", "")
    monkeypatch.setenv("MONGODB_DATABASE", "")

    config = get_database_config()
    assert config["mode"] == "mock"
    assert config["database_name"] == "soet_connect_test"


def test_database_config_atlas_mode_missing_url(monkeypatch):
    """In Atlas/production mode, missing MONGODB_URL and MONGODB_URI raises ValueError."""
    monkeypatch.setenv("DATABASE_MODE", "atlas")
    monkeypatch.setenv("MONGODB_URL", "")
    monkeypatch.setenv("MONGODB_URI", "")
    monkeypatch.setenv("DATABASE_NAME", "soet_connect")

    with pytest.raises(ValueError, match="MongoDB connection URI is not configured"):
        get_database_config()


def test_database_config_atlas_mode_placeholder_url_rejected(monkeypatch):
    """In Atlas/production mode, example placeholder URL must be rejected."""
    monkeypatch.setenv("DATABASE_MODE", "atlas")
    monkeypatch.setenv("MONGODB_URL", "YOUR_MONGODB_CONNECTION_STRING")
    monkeypatch.setenv("DATABASE_NAME", "soet_connect")

    with pytest.raises(ValueError, match="MongoDB connection URI is not configured"):
        get_database_config()


def test_database_config_atlas_mode_missing_database_name(monkeypatch):
    """In Atlas/production mode, missing DATABASE_NAME raises ValueError."""
    monkeypatch.setenv("DATABASE_MODE", "atlas")
    monkeypatch.setenv("MONGODB_URL", "mongodb+srv://user:pass@cluster.mongodb.net/")
    monkeypatch.setenv("DATABASE_NAME", "")
    monkeypatch.setenv("MONGODB_DATABASE", "")

    with pytest.raises(ValueError, match="MongoDB database name is not configured"):
        get_database_config()


def test_database_config_atlas_mode_placeholder_dbname_rejected(monkeypatch):
    """In Atlas/production mode, example placeholder database name must be rejected."""
    monkeypatch.setenv("DATABASE_MODE", "atlas")
    monkeypatch.setenv("MONGODB_URL", "mongodb+srv://user:pass@cluster.mongodb.net/")
    monkeypatch.setenv("DATABASE_NAME", "YOUR_DATABASE_NAME")
    monkeypatch.setenv("MONGODB_DATABASE", "")

    with pytest.raises(ValueError, match="MongoDB database name is not configured"):
        get_database_config()


def test_database_config_atlas_mode_supports_uri_and_database_aliases(monkeypatch):
    """Atlas mode accepts MONGODB_URI and MONGODB_DATABASE as standard aliases."""
    monkeypatch.setenv("DATABASE_MODE", "atlas")
    monkeypatch.setenv("MONGODB_URL", "")
    monkeypatch.setenv("MONGODB_URI", "mongodb+srv://admin:pass@atlascluster.mongodb.net/")
    monkeypatch.setenv("DATABASE_NAME", "")
    monkeypatch.setenv("MONGODB_DATABASE", "soet_portal_prod")
    monkeypatch.setenv("MONGODB_TIMEOUT_MS", "8000")

    config = get_database_config()
    assert config["mode"] == "atlas"
    assert config["mongodb_url"] == "mongodb+srv://admin:pass@atlascluster.mongodb.net/"
    assert config["database_name"] == "soet_portal_prod"
    assert config["timeout_ms"] == 8000


def test_database_config_atlas_mode_default_timeout(monkeypatch):
    """Atlas mode defaults to 5000ms timeout if MONGODB_TIMEOUT_MS is unset or invalid."""
    monkeypatch.setenv("DATABASE_MODE", "atlas")
    monkeypatch.setenv("MONGODB_URL", "mongodb+srv://user:pass@cluster.mongodb.net/")
    monkeypatch.setenv("DATABASE_NAME", "soet_connect")
    monkeypatch.setenv("MONGODB_TIMEOUT_MS", "invalid_int")

    config = get_database_config()
    assert config["timeout_ms"] == 5000
