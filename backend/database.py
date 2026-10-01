import os
import certifi
from dotenv import load_dotenv

load_dotenv()

DATABASE_MODE = os.getenv("DATABASE_MODE", "atlas").lower()


def get_database_config():
    """Resolve and validate MongoDB configuration from environment variables.

    Returns:
        dict with keys:
            - 'mode': 'mock' or 'atlas'
            - 'mongodb_url': connection URI string (or None in mock mode)
            - 'database_name': database name string
            - 'timeout_ms': serverSelectionTimeoutMS integer
    """
    mode = os.getenv("DATABASE_MODE", "atlas").lower()

    if mode == "mock":
        db_name = (
            os.getenv("DATABASE_NAME", "").strip()
            or os.getenv("MONGODB_DATABASE", "").strip()
            or "soet_connect_test"
        )
        return {
            "mode": "mock",
            "mongodb_url": None,
            "database_name": db_name,
            "timeout_ms": 0,
        }

    # Normal / MongoDB Atlas production mode
    mongodb_url = (
        os.getenv("MONGODB_URL", "").strip()
        or os.getenv("MONGODB_URI", "").strip()
    )
    database_name = (
        os.getenv("DATABASE_NAME", "").strip()
        or os.getenv("MONGODB_DATABASE", "").strip()
    )

    if not mongodb_url or mongodb_url == "YOUR_MONGODB_CONNECTION_STRING":
        raise ValueError(
            "MongoDB connection URI is not configured. Set MONGODB_URL (or MONGODB_URI) in your .env file."
        )

    if not database_name or database_name == "YOUR_DATABASE_NAME":
        raise ValueError(
            "MongoDB database name is not configured. Set DATABASE_NAME (or MONGODB_DATABASE) in your .env file."
        )

    try:
        timeout_ms = int(os.getenv("MONGODB_TIMEOUT_MS", "5000"))
    except ValueError:
        timeout_ms = 5000

    return {
        "mode": "atlas",
        "mongodb_url": mongodb_url,
        "database_name": database_name,
        "timeout_ms": timeout_ms,
    }


_config = get_database_config()

if _config["mode"] == "mock":
    # ---- Mock mode: use mongomock (no real MongoDB needed) ----
    import mongomock

    client = mongomock.MongoClient()
    DATABASE_NAME = _config["database_name"]
    database = client[DATABASE_NAME]
else:
    # ---- Production mode: real MongoDB Atlas ----
    from pymongo import MongoClient

    MONGODB_URL = _config["mongodb_url"]
    DATABASE_NAME = _config["database_name"]
    timeout_ms = _config["timeout_ms"]

    client_kwargs = {
        "serverSelectionTimeoutMS": timeout_ms,
        "tlsCAFile": certifi.where(),
    }

    if (
        MONGODB_URL.startswith("mongodb+srv://")
        or "tls=true" in MONGODB_URL.lower()
        or "ssl=true" in MONGODB_URL.lower()
    ):
        client_kwargs["tls"] = True

    client = MongoClient(MONGODB_URL, **client_kwargs)
    database = client[DATABASE_NAME]

users_collection = database["users"]


def test_database_connection():
    try:
        client.admin.command("ping")
        return True
    except Exception as e:
        print(f"MONGODB CONNECTION ERROR: {type(e).__name__} - {e}")
        return False