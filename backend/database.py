"""
SOET Connect — Unified Database Layer (Supabase PostgreSQL)
===========================================================
Supabase PostgreSQL is the sole persistent database for SOET Connect.
MongoDB runtime dependencies have been completely removed.
"""

import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DATABASE_BACKEND = "supabase"
DATABASE_MODE = os.getenv("DATABASE_MODE", "supabase").lower()

from database_supabase import (
    supabase,
    supabase_users_collection,
    supabase_conversations_collection,
    supabase_messages_collection,
    test_supabase_connection,
    get_supabase_config,
    reset_mock_db,
)

class DatabaseAdapter:
    """Drop-in adapter allowing database['conversations'] syntax for compatibility."""
    def __getitem__(self, item: str):
        if item == "users":
            return users_collection
        elif item == "conversations":
            return conversations_collection
        elif item == "messages":
            return messages_collection
        raise KeyError(f"Collection '{item}' not supported in Supabase database adapter.")

# Active database client and collections
client = None
users_collection = supabase_users_collection
conversations_collection = supabase_conversations_collection
messages_collection = supabase_messages_collection
database = DatabaseAdapter()
test_database_connection = test_supabase_connection


def get_database_config() -> dict:
    """Return active database configuration metadata."""
    cfg = get_supabase_config()
    return {
        "backend": "supabase",
        "mode": DATABASE_MODE,
        **cfg,
    }