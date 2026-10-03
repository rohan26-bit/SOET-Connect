import os
import certifi
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DATABASE_BACKEND = os.getenv("DATABASE_BACKEND", "mongodb").lower()
DATABASE_MODE = os.getenv("DATABASE_MODE", "atlas").lower()

if DATABASE_BACKEND == "supabase":
    # ---- Supabase PostgreSQL Mode ----
    from database_supabase import (
        supabase,
        supabase_users_collection,
        test_supabase_connection,
    )

    client = None
    database = None
    users_collection = supabase_users_collection
    test_database_connection = test_supabase_connection

else:
    # ---- MongoDB Mode (Atlas or Mock) ----
    def get_database_config():
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
        import mongomock

        client = mongomock.MongoClient()
        DATABASE_NAME = _config["database_name"]
        database = client[DATABASE_NAME]
    else:
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