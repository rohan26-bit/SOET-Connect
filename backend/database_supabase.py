"""
SOET Connect — Supabase PostgreSQL Database Adapter
===================================================
Provides PostgREST API client and collection-compatible interfaces
for Supabase PostgreSQL tables while preserving existing application logic.
Supports both live PostgREST execution and fast isolated in-memory mock mode.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union
import httpx

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


# ==============================================================================
# CONFIGURATION
# ==============================================================================

DEFAULT_SUPABASE_URL = "https://asrapgcooudqogvuoypg.supabase.co"


def get_supabase_config() -> dict:
    """Resolve Supabase connection configuration from environment variables."""
    url = (
        os.getenv("SUPABASE_URL", "").strip().strip("\"'")
        or DEFAULT_SUPABASE_URL
    )
    service_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip().strip("\"'")
        or os.getenv("SUPABASE_KEY", "").strip().strip("\"'")
    )
    anon_key = (
        os.getenv("SUPABASE_ANON_KEY", "").strip().strip("\"'")
    )

    return {
        "url": url.rstrip("/"),
        "service_role_key": service_key,
        "anon_key": anon_key,
        "rest_url": f"{url.rstrip('/')}/rest/v1",
        "auth_url": f"{url.rstrip('/')}/auth/v1",
    }


_config = get_supabase_config()
SUPABASE_URL = _config["url"]
SUPABASE_SERVICE_ROLE_KEY = _config["service_role_key"]
SUPABASE_REST_URL = _config["rest_url"]


def get_headers(prefer_return: str = "representation") -> dict:
    """Generate authorization headers for Supabase PostgREST service-role requests."""
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": f"return={prefer_return}",
    }


def test_supabase_connection() -> bool:
    """Test connectivity to the remote Supabase PostgreSQL database."""
    if os.getenv("DATABASE_MODE", "").lower() == "mock":
        return True

    try:
        cfg = get_supabase_config()
        with httpx.Client(timeout=6.0) as client:
            resp = client.get(
                f"{cfg['rest_url']}/users?limit=1",
                headers=get_headers(),
            )
            return resp.status_code == 200
    except Exception as e:
        print(f"SUPABASE CONNECTION ERROR: {type(e).__name__} - {e}")
        return False


# ==============================================================================
# QUERY RESULT
# ==============================================================================

class QueryResult:
    """Encapsulates PostgREST response data."""
    def __init__(self, data: Any, count: Optional[int] = None, status_code: int = 200):
        self.data = data
        self.count = count
        self.status_code = status_code


# ==============================================================================
# IN-MEMORY MOCK STORE FOR FAST, ISOLATED TESTS
# ==============================================================================

_mock_store: Dict[str, List[dict]] = {
    "users": [],
    "student_profiles": [],
    "alumni_profiles": [],
    "jobs": [],
    "job_applications": [],
    "events": [],
    "event_registrations": [],
    "conversations": [],
    "conversation_participants": [],
    "messages": [],
    "announcements": [],
    "notifications": [],
    "achievements": [],
    "bug_reports": [],
}


def reset_mock_db():
    """Clear all mock tables for test isolation."""
    for key in _mock_store:
        _mock_store[key].clear()


class MockInsertBuilder:
    def __init__(self, data: list):
        self.data = data

    def execute(self) -> QueryResult:
        return QueryResult(data=self.data, status_code=201)


class MockUpdateBuilder:
    def __init__(self, builder: 'MockQueryBuilder', values: dict):
        self.builder = builder
        self.values = values

    def eq(self, column: str, value: Any) -> 'MockUpdateBuilder':
        self.builder.eq(column, value)
        return self

    def execute(self) -> QueryResult:
        table_rows = _mock_store.setdefault(self.builder.table_name, [])
        updated = []
        now_iso = datetime.now(timezone.utc).isoformat()
        for row in table_rows:
            if self.builder._matches(row):
                row.update(self.values)
                if "updated_at" in row:
                    row["updated_at"] = now_iso
                updated.append(dict(row))
        return QueryResult(data=updated, status_code=200)


class MockDeleteBuilder:
    def __init__(self, builder: 'MockQueryBuilder'):
        self.builder = builder

    def eq(self, column: str, value: Any) -> 'MockDeleteBuilder':
        self.builder.eq(column, value)
        return self

    def neq(self, column: str, value: Any) -> 'MockDeleteBuilder':
        self.builder.neq(column, value)
        return self

    def execute(self) -> QueryResult:
        table_rows = _mock_store.setdefault(self.builder.table_name, [])
        kept = []
        deleted = []
        for row in table_rows:
            if self.builder._matches(row):
                deleted.append(dict(row))
            else:
                kept.append(row)
        _mock_store[self.builder.table_name] = kept
        return QueryResult(data=deleted, status_code=200)


class MockQueryBuilder:
    """PostgREST query builder emulation backed by in-memory data store."""

    def __init__(self, table_name: str):
        self.table_name = table_name
        self.filters: List[tuple] = []
        self.order_by: Optional[tuple] = None
        self.limit_count: Optional[int] = None

    def select(self, columns: str = "*", count: Optional[str] = None):
        return self

    def eq(self, column: str, value: Any):
        self.filters.append((column, "eq", value))
        return self

    def neq(self, column: str, value: Any):
        self.filters.append((column, "neq", value))
        return self

    def in_(self, column: str, values: list):
        self.filters.append((column, "in", values))
        return self

    def order(self, column: str, desc: bool = False):
        self.order_by = (column, desc)
        return self

    def limit(self, count: int):
        self.limit_count = count
        return self

    def _matches(self, row: dict) -> bool:
        for col, op, val in self.filters:
            row_val = row.get(col)
            if op == "eq":
                if isinstance(val, bool) or isinstance(row_val, bool):
                    if row_val != val:
                        return False
                elif str(row_val if row_val is not None else "").strip().lower() != str(val if val is not None else "").strip().lower():
                    return False
            elif op == "neq":
                if str(row_val if row_val is not None else "").strip().lower() == str(val if val is not None else "").strip().lower():
                    return False
            elif op == "in":
                vals = [str(v).strip().lower() for v in val]
                if str(row_val if row_val is not None else "").strip().lower() not in vals:
                    return False
        return True

    def execute(self) -> QueryResult:
        table_rows = _mock_store.setdefault(self.table_name, [])
        matched = [dict(r) for r in table_rows if self._matches(r)]
        if self.order_by:
            col, desc = self.order_by
            matched.sort(key=lambda x: str(x.get(col, "") or ""), reverse=desc)
        if self.limit_count is not None:
            matched = matched[:self.limit_count]
        return QueryResult(data=matched, status_code=200)

    def insert(self, record_or_records: Union[dict, list]) -> MockInsertBuilder:
        table_rows = _mock_store.setdefault(self.table_name, [])
        is_list = isinstance(record_or_records, list)
        items = record_or_records if is_list else [record_or_records]
        inserted = []
        now_iso = datetime.now(timezone.utc).isoformat()
        for item in items:
            row = dict(item)
            if "id" not in row or not row["id"]:
                row["id"] = str(uuid.uuid4())
            if "created_at" not in row:
                row["created_at"] = now_iso
            if "updated_at" not in row:
                row["updated_at"] = now_iso
            table_rows.append(row)
            inserted.append(dict(row))
        return MockInsertBuilder(inserted)

    def upsert(self, record_or_records: Union[dict, list]) -> MockInsertBuilder:
        table_rows = _mock_store.setdefault(self.table_name, [])
        is_list = isinstance(record_or_records, list)
        items = record_or_records if is_list else [record_or_records]
        result = []
        now_iso = datetime.now(timezone.utc).isoformat()
        for item in items:
            row = dict(item)
            item_id = row.get("id")
            found = False
            if item_id:
                for existing in table_rows:
                    if str(existing.get("id")) == str(item_id):
                        existing.update(row)
                        if "updated_at" in existing:
                            existing["updated_at"] = now_iso
                        result.append(dict(existing))
                        found = True
                        break
            if not found:
                if "id" not in row or not row["id"]:
                    row["id"] = str(uuid.uuid4())
                if "created_at" not in row:
                    row["created_at"] = now_iso
                if "updated_at" not in row:
                    row["updated_at"] = now_iso
                table_rows.append(row)
                result.append(dict(row))
        return MockInsertBuilder(result)

    def update(self, values: dict) -> MockUpdateBuilder:
        return MockUpdateBuilder(self, values)

    def delete(self) -> MockDeleteBuilder:
        return MockDeleteBuilder(self)


# ==============================================================================
# REMOTE SUPABASE POSTGREST QUERY BUILDER
# ==============================================================================

class SupabaseInsertBuilder:
    def __init__(self, base_url: str, record_or_records: Union[dict, list], headers: dict, timeout: float):
        self.base_url = base_url
        self.record_or_records = record_or_records
        self.headers = headers
        self.timeout = timeout

    def execute(self) -> QueryResult:
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(self.base_url, headers=self.headers, json=self.record_or_records)
            if not resp.is_success:
                raise RuntimeError(f"Supabase insert failed ({resp.status_code}): {resp.text}")
            return QueryResult(data=resp.json(), status_code=resp.status_code)


class SupabaseUpsertBuilder:
    def __init__(self, base_url: str, record_or_records: Union[dict, list], headers: dict, timeout: float):
        self.base_url = base_url
        self.record_or_records = record_or_records
        self.headers = dict(headers)
        self.headers["Prefer"] = "resolution=merge-duplicates"
        self.timeout = timeout

    def execute(self) -> QueryResult:
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(self.base_url, headers=self.headers, json=self.record_or_records)
            if not resp.is_success:
                raise RuntimeError(f"Supabase upsert failed ({resp.status_code}): {resp.text}")
            return QueryResult(data=resp.json(), status_code=resp.status_code)


class SupabaseUpdateBuilder:
    def __init__(self, base_url: str, values: dict, headers: dict, timeout: float):
        self.base_url = base_url
        self.values = values
        self.headers = headers
        self.timeout = timeout
        self.params: Dict[str, str] = {}

    def eq(self, column: str, value: Any) -> 'SupabaseUpdateBuilder':
        self.params[column] = f"eq.{value}"
        return self

    def execute(self) -> QueryResult:
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.patch(self.base_url, headers=self.headers, params=self.params, json=self.values)
            if not resp.is_success:
                raise RuntimeError(f"Supabase update failed ({resp.status_code}): {resp.text}")
            return QueryResult(data=resp.json(), status_code=resp.status_code)


class SupabaseDeleteBuilder:
    def __init__(self, base_url: str, headers: dict, timeout: float):
        self.base_url = base_url
        self.headers = headers
        self.timeout = timeout
        self.params: Dict[str, str] = {}

    def eq(self, column: str, value: Any) -> 'SupabaseDeleteBuilder':
        self.params[column] = f"eq.{value}"
        return self

    def neq(self, column: str, value: Any) -> 'SupabaseDeleteBuilder':
        self.params[column] = f"neq.{value}"
        return self

    def execute(self) -> QueryResult:
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.delete(self.base_url, headers=self.headers, params=self.params)
            if not resp.is_success:
                raise RuntimeError(f"Supabase delete failed ({resp.status_code}): {resp.text}")
            return QueryResult(data=resp.json(), status_code=resp.status_code)


class SupabaseQueryBuilder:
    """Fluent query builder for Supabase PostgREST tables."""

    def __init__(self, table_name: str, base_url: str = None, timeout: float = 10.0):
        self.table_name = table_name
        cfg = get_supabase_config()
        self.base_url = f"{base_url or cfg['rest_url']}/{table_name}"
        self.timeout = timeout
        self.params: Dict[str, str] = {}
        self.headers = get_headers()

    def select(self, columns: str = "*", count: Optional[str] = None):
        self.params["select"] = columns
        if count:
            self.headers["Prefer"] = f"count={count}"
        return self

    def eq(self, column: str, value: Any):
        self.params[column] = f"eq.{value}"
        return self

    def neq(self, column: str, value: Any):
        self.params[column] = f"neq.{value}"
        return self

    def in_(self, column: str, values: list):
        formatted = ",".join(str(v) for v in values)
        self.params[column] = f"in.({formatted})"
        return self

    def order(self, column: str, desc: bool = False):
        direction = "desc" if desc else "asc"
        self.params["order"] = f"{column}.{direction}"
        return self

    def limit(self, count: int):
        self.params["limit"] = str(count)
        return self

    def execute(self) -> QueryResult:
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.get(self.base_url, headers=self.headers, params=self.params)
            if not resp.is_success:
                raise RuntimeError(f"Supabase query failed ({resp.status_code}): {resp.text}")
            return QueryResult(data=resp.json(), status_code=resp.status_code)

    def insert(self, record_or_records: Union[dict, list]) -> SupabaseInsertBuilder:
        return SupabaseInsertBuilder(self.base_url, record_or_records, self.headers, self.timeout)

    def upsert(self, record_or_records: Union[dict, list]) -> SupabaseUpsertBuilder:
        return SupabaseUpsertBuilder(self.base_url, record_or_records, self.headers, self.timeout)

    def update(self, values: dict) -> SupabaseUpdateBuilder:
        return SupabaseUpdateBuilder(self.base_url, values, self.headers, self.timeout)

    def delete(self) -> SupabaseDeleteBuilder:
        return SupabaseDeleteBuilder(self.base_url, self.headers, self.timeout)


class SupabaseClient:
    """Primary client instance for accessing Supabase PostgreSQL."""

    def table(self, table_name: str):
        if os.getenv("DATABASE_MODE", "").lower() == "mock":
            return MockQueryBuilder(table_name)
        return SupabaseQueryBuilder(table_name)

    def from_(self, table_name: str):
        return self.table(table_name)


supabase = SupabaseClient()


# ==============================================================================
# COLLECTION-COMPATIBLE ADAPTER FOR USERS
# ==============================================================================

class InsertResult:
    def __init__(self, inserted_id: str):
        self.inserted_id = str(inserted_id)


class UpdateResult:
    def __init__(self, modified_count: int):
        self.modified_count = modified_count


class SupabaseUsersCollection:
    """
    Drop-in compatibility adapter replicating PyMongo's users_collection interface
    backed directly by the Supabase PostgreSQL `users`, `student_profiles`,
    and `alumni_profiles` tables.
    """

    def _format_user_output(self, user_row: dict) -> Optional[dict]:
        """Combine user record with linked student/alumni profile into expected application shape."""
        if not user_row:
            return None

        user_id = str(user_row.get("id"))
        display_id = user_row.get("legacy_mongo_id") or user_id
        doc = {
            "_id": display_id,
            "id": display_id,
            "_db_id": user_id,
            "legacy_mongo_id": user_row.get("legacy_mongo_id"),
            "name": user_row.get("name", ""),
            "email": user_row.get("email", ""),
            "password_hash": user_row.get("password_hash", ""),
            "role": user_row.get("role", ""),
            "avatar_url": user_row.get("avatar_url"),
            "is_active": user_row.get("is_active", True),
            "is_verified": user_row.get("is_verified", False),
            "verification_status": user_row.get("verification_status", "pending"),
            "created_at": user_row.get("created_at"),
            "updated_at": user_row.get("updated_at"),
        }

        role = user_row.get("role")
        if role == "student":
            try:
                prof_res = supabase.table("student_profiles").select("*").eq("user_id", user_id).execute()
                if prof_res.data:
                    p = prof_res.data[0]
                    doc["student_profile"] = {
                        "student_id": p.get("student_id"),
                        "department": p.get("department"),
                        "course": p.get("course"),
                        "academic_year": p.get("academic_year"),
                        "graduation_year": p.get("graduation_year"),
                        "phone": p.get("phone"),
                    }
                else:
                    doc["student_profile"] = {}
            except Exception:
                doc["student_profile"] = {}

        elif role == "alumni":
            try:
                prof_res = supabase.table("alumni_profiles").select("*").eq("user_id", user_id).execute()
                if prof_res.data:
                    p = prof_res.data[0]
                    doc["alumni_profile"] = {
                        "alumni_id": p.get("alumni_id"),
                        "department": p.get("department"),
                        "degree": p.get("degree"),
                        "graduation_year": p.get("graduation_year"),
                        "company": p.get("company"),
                        "designation": p.get("designation"),
                        "industry": p.get("industry"),
                        "location": p.get("location"),
                        "skills": p.get("skills", []),
                        "linkedin": p.get("linkedin"),
                        "github": p.get("github"),
                        "website": p.get("website"),
                        "bio": p.get("bio"),
                        "verification_status": user_row.get("verification_status", "pending"),
                    }
                else:
                    doc["alumni_profile"] = {}
            except Exception:
                doc["alumni_profile"] = {}

        return doc

    def find_one(self, filter_dict: dict) -> Optional[dict]:
        """Find a single user document matching the filter criteria."""
        if not filter_dict:
            res = supabase.table("users").select("*").limit(1).execute()
            return self._format_user_output(res.data[0]) if res.data else None

        # Filter by email
        if "email" in filter_dict:
            email_val = str(filter_dict["email"]).lower().strip()
            q = supabase.table("users").select("*").eq("email", email_val)
            if "role" in filter_dict:
                q = q.eq("role", filter_dict["role"])
            res = q.limit(1).execute()
            return self._format_user_output(res.data[0]) if res.data else None

        # Filter by _id or id
        id_val = filter_dict.get("_id") or filter_dict.get("id")
        if id_val:
            id_str = str(id_val).strip()
            role_filter = filter_dict.get("role")

            # Try by id (UUID)
            q1 = supabase.table("users").select("*").eq("id", id_str)
            if role_filter:
                q1 = q1.eq("role", role_filter)
            res1 = q1.limit(1).execute()
            if res1.data:
                return self._format_user_output(res1.data[0])

            # Try by legacy_mongo_id
            q2 = supabase.table("users").select("*").eq("legacy_mongo_id", id_str)
            if role_filter:
                q2 = q2.eq("role", role_filter)
            res2 = q2.limit(1).execute()
            if res2.data:
                return self._format_user_output(res2.data[0])
            return None

        # Filter by other fields
        q = supabase.table("users").select("*")
        for k, v in filter_dict.items():
            q = q.eq(k, v)
        res = q.limit(1).execute()
        return self._format_user_output(res.data[0]) if res.data else None

    def find(self, filter_dict: Optional[dict] = None) -> list:
        """Find user documents matching the filter criteria."""
        q = supabase.table("users").select("*")

        if filter_dict:
            for k, v in filter_dict.items():
                if k in ["role", "is_active", "is_verified", "verification_status"]:
                    q = q.eq(k, v)

        res = q.execute()
        return [self._format_user_output(row) for row in res.data or []]

    def insert_one(self, doc: dict) -> InsertResult:
        """Insert a user document into users and linked profile tables."""
        raw_id = doc.get("_id") or doc.get("id")
        user_id = None
        legacy_mongo_id = None
        if raw_id:
            raw_id_str = str(raw_id).strip()
            try:
                uuid.UUID(raw_id_str)
                user_id = raw_id_str
            except (ValueError, AttributeError):
                legacy_mongo_id = raw_id_str
                user_id = str(uuid.uuid4())
        else:
            user_id = str(uuid.uuid4())

        user_row = {
            "id": user_id,
            "name": doc.get("name"),
            "email": str(doc.get("email", "")).lower().strip(),
            "password_hash": doc.get("password_hash"),
            "role": doc.get("role"),
            "avatar_url": doc.get("avatar_url"),
            "is_active": doc.get("is_active", True),
            "is_verified": doc.get("is_verified", False),
            "verification_status": doc.get("verification_status", "pending"),
        }
        if legacy_mongo_id:
            user_row["legacy_mongo_id"] = legacy_mongo_id

        res = supabase.table("users").insert(user_row).execute()
        if not res.data:
            raise RuntimeError("Failed to insert user into Supabase users table.")

        created_user = res.data[0]
        actual_id = str(created_user["id"])

        # Insert linked profile
        role = created_user.get("role")
        if role == "student" and "student_profile" in doc:
            sp = doc.get("student_profile", {}) or {}
            supabase.table("student_profiles").insert({
                "user_id": actual_id,
                "student_id": sp.get("student_id"),
                "department": sp.get("department"),
                "course": sp.get("course"),
                "academic_year": sp.get("academic_year"),
                "graduation_year": sp.get("graduation_year"),
                "phone": sp.get("phone"),
            }).execute()

        elif role == "alumni" and "alumni_profile" in doc:
            ap = doc.get("alumni_profile", {}) or {}
            supabase.table("alumni_profiles").insert({
                "user_id": actual_id,
                "alumni_id": ap.get("alumni_id"),
                "department": ap.get("department"),
                "degree": ap.get("degree"),
                "graduation_year": ap.get("graduation_year"),
                "company": ap.get("company"),
                "designation": ap.get("designation"),
                "industry": ap.get("industry"),
                "location": ap.get("location"),
                "skills": ap.get("skills", []),
                "linkedin": ap.get("linkedin"),
                "github": ap.get("github"),
                "website": ap.get("website"),
                "bio": ap.get("bio"),
            }).execute()

        return InsertResult(inserted_id=actual_id)

    def update_one(self, filter_dict: dict, update_dict: dict) -> UpdateResult:
        """Update a user record and any embedded profile fields."""
        target_user = self.find_one(filter_dict)
        if not target_user:
            return UpdateResult(modified_count=0)

        real_id = target_user.get("_db_id") or target_user["id"]
        set_fields = update_dict.get("$set", {})

        # Base user fields
        base_updates = {}
        for k in ["name", "email", "password_hash", "avatar_url", "is_active", "is_verified", "verification_status"]:
            if k in set_fields:
                base_updates[k] = set_fields[k]

        if base_updates:
            builder = supabase.table("users").update(base_updates)
            if target_user.get("_db_id"):
                builder = builder.eq("id", target_user["_db_id"])
            elif target_user.get("legacy_mongo_id"):
                builder = builder.eq("legacy_mongo_id", target_user["legacy_mongo_id"])
            else:
                builder = builder.eq("id", real_id)
            builder.execute()

        # Update student profile fields
        if "student_profile" in set_fields:
            sp = set_fields["student_profile"]
            prof_updates = {
                k: sp[k] for k in ["student_id", "department", "course", "academic_year", "graduation_year", "phone"]
                if k in sp
            }
            if prof_updates:
                existing_prof = supabase.table("student_profiles").select("user_id").eq("user_id", real_id).execute()
                if existing_prof.data:
                    supabase.table("student_profiles").update(prof_updates).eq("user_id", real_id).execute()
                else:
                    prof_updates["user_id"] = real_id
                    supabase.table("student_profiles").insert(prof_updates).execute()

        # Update alumni profile fields
        if "alumni_profile" in set_fields:
            ap = set_fields["alumni_profile"]
            prof_updates = {
                k: ap[k] for k in [
                    "alumni_id", "department", "degree", "graduation_year", "company",
                    "designation", "industry", "location", "skills", "linkedin", "github", "website", "bio"
                ] if k in ap
            }
            if prof_updates:
                existing_prof = supabase.table("alumni_profiles").select("user_id").eq("user_id", real_id).execute()
                if existing_prof.data:
                    supabase.table("alumni_profiles").update(prof_updates).eq("user_id", real_id).execute()
                else:
                    prof_updates["user_id"] = real_id
                    supabase.table("alumni_profiles").insert(prof_updates).execute()

        return UpdateResult(modified_count=1)

    def delete_one(self, filter_dict: dict) -> UpdateResult:
        """Delete a single user record."""
        target_user = self.find_one(filter_dict)
        if not target_user:
            return UpdateResult(modified_count=0)

        real_id = target_user.get("_db_id") or target_user["id"]
        builder = supabase.table("users").delete()
        if target_user.get("_db_id"):
            builder = builder.eq("id", target_user["_db_id"])
        elif target_user.get("legacy_mongo_id"):
            builder = builder.eq("legacy_mongo_id", target_user["legacy_mongo_id"])
        else:
            builder = builder.eq("id", real_id)
        builder.execute()
        return UpdateResult(modified_count=1)

    def delete_many(self, filter_dict: Optional[dict] = None) -> UpdateResult:
        """Delete multiple user records."""
        if os.getenv("DATABASE_MODE", "").lower() == "mock":
            if not filter_dict:
                count = len(_mock_store.get("users", []))
                _mock_store["users"].clear()
                _mock_store["student_profiles"].clear()
                _mock_store["alumni_profiles"].clear()
                return UpdateResult(modified_count=count)
            users_to_del = self.find(filter_dict)
            count = len(users_to_del)
            for u in users_to_del:
                self.delete_one({"id": u["id"]})
            return UpdateResult(modified_count=count)

        if not filter_dict:
            res = supabase.table("users").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            return UpdateResult(modified_count=len(res.data or []))

        users_to_del = self.find(filter_dict)
        count = 0
        for u in users_to_del:
            supabase.table("users").delete().eq("id", u["id"]).execute()
            count += 1
        return UpdateResult(modified_count=count)

    def count_documents(self, filter_dict: Optional[dict] = None) -> int:
        return len(self.find(filter_dict or {}))


supabase_users_collection = SupabaseUsersCollection()


# ==============================================================================
# COLLECTION-COMPATIBLE ADAPTERS FOR CHAT
# ==============================================================================

class SupabaseConversationsCollection:
    """Drop-in collection interface for Supabase conversations table."""

    def find_one(self, filter_dict: dict) -> Optional[dict]:
        if not filter_dict:
            return None

        if "canonical_key" in filter_dict:
            res = supabase.table("conversations").select("*").eq("canonical_key", filter_dict["canonical_key"]).limit(1).execute()
            if res.data:
                return self._format_conv(res.data[0])
            return None

        if "_id" in filter_dict or "id" in filter_dict:
            id_val = str(filter_dict.get("_id") or filter_dict.get("id"))
            res = supabase.table("conversations").select("*").eq("id", id_val).limit(1).execute()
            if res.data:
                return self._format_conv(res.data[0])
            return None

        return None

    def _format_conv(self, row: dict) -> dict:
        conv_id = str(row["id"])
        canonical_key = row.get("canonical_key", "")
        parts = canonical_key.split(":") if ":" in canonical_key else []
        hidden_for = row.get("hidden_for", []) or []

        last_msg = None
        last_msg_at = None
        try:
            last_msg_res = supabase.table("messages").select("*").eq("conversation_id", conv_id).order("created_at", desc=True).limit(1).execute()
            if last_msg_res.data:
                m = last_msg_res.data[0]
                last_msg = {
                    "id": str(m["id"]),
                    "sender_id": str(m["sender_id"]),
                    "content": m["content"],
                    "created_at": m["created_at"],
                }
                last_msg_at = m["created_at"]
        except Exception:
            pass

        return {
            "_id": conv_id,
            "id": conv_id,
            "canonical_key": canonical_key,
            "participant_ids": parts,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
            "last_message_at": last_msg_at,
            "deleted_for": hidden_for,
            "last_message": last_msg,
        }

    def find(self, filter_dict: Optional[dict] = None) -> list:
        if filter_dict and "participant_ids" in filter_dict:
            user_id = str(filter_dict["participant_ids"])
            try:
                res = supabase.table("conversation_participants").select("conversation_id").eq("user_id", user_id).execute()
                conv_ids = [str(r["conversation_id"]) for r in res.data or []]
                if not conv_ids:
                    return []
                convs = []
                for cid in conv_ids:
                    c_res = supabase.table("conversations").select("*").eq("id", cid).execute()
                    if c_res.data:
                        convs.append(self._format_conv(c_res.data[0]))
                return convs
            except Exception:
                return []

        res = supabase.table("conversations").select("*").execute()
        return [self._format_conv(r) for r in res.data or []]

    def insert_one(self, doc: dict) -> InsertResult:
        canonical_key = doc.get("canonical_key")
        hidden_for = doc.get("deleted_for", []) or []
        res = supabase.table("conversations").insert({
            "canonical_key": canonical_key,
            "hidden_for": hidden_for,
        }).execute()

        created = res.data[0]
        conv_id = str(created["id"])

        participants = doc.get("participant_ids", [])
        for pid in participants:
            try:
                supabase.table("conversation_participants").insert({
                    "conversation_id": conv_id,
                    "user_id": str(pid),
                }).execute()
            except Exception:
                pass

        return InsertResult(inserted_id=conv_id)

    def update_one(self, filter_dict: dict, update_dict: dict) -> UpdateResult:
        id_val = str(filter_dict.get("_id") or filter_dict.get("id"))
        set_dict = update_dict.get("$set", {})
        pull_dict = update_dict.get("$pull", {})
        add_dict = update_dict.get("$addToSet", {})

        conv = self.find_one({"_id": id_val})
        if not conv:
            return UpdateResult(modified_count=0)

        updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
        current_hidden = list(conv.get("deleted_for", []))

        if "deleted_for" in set_dict:
            current_hidden = list(set_dict["deleted_for"])
            updates["hidden_for"] = current_hidden

        if "deleted_for" in pull_dict:
            pull_val = str(pull_dict["deleted_for"])
            current_hidden = [x for x in current_hidden if x != pull_val]
            updates["hidden_for"] = current_hidden

        if "deleted_for" in add_dict:
            add_val = str(add_dict["deleted_for"])
            if add_val not in current_hidden:
                current_hidden.append(add_val)
            updates["hidden_for"] = current_hidden

        supabase.table("conversations").update(updates).eq("id", id_val).execute()
        return UpdateResult(modified_count=1)

    def count_documents(self, filter_dict: Optional[dict] = None) -> int:
        if not filter_dict:
            res = supabase.table("conversations").select("*").execute()
            return len(res.data or [])
        res = self.find(filter_dict)
        return len(res)

    def delete_one(self, filter_dict: dict) -> UpdateResult:
        id_val = str(filter_dict.get("_id") or filter_dict.get("id"))
        supabase.table("conversations").delete().eq("id", id_val).execute()
        return UpdateResult(modified_count=1)

    def delete_many(self, filter_dict: Optional[dict] = None) -> UpdateResult:
        if os.getenv("DATABASE_MODE", "").lower() == "mock":
            _mock_store["conversations"].clear()
            _mock_store["conversation_participants"].clear()
            return UpdateResult(modified_count=1)
        supabase.table("conversations").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        return UpdateResult(modified_count=1)


class SupabaseMessagesCollection:
    """Drop-in collection interface for Supabase messages table."""

    def find(self, filter_dict: Optional[dict] = None) -> list:
        q = supabase.table("messages").select("*")
        if filter_dict:
            if "conversation_id" in filter_dict:
                q = q.eq("conversation_id", str(filter_dict["conversation_id"]))
            if "sender_id" in filter_dict:
                q = q.eq("sender_id", str(filter_dict["sender_id"]))
            if "is_read" in filter_dict:
                q = q.eq("is_read", filter_dict["is_read"])

        res = q.order("created_at").execute()
        out = []
        for m in res.data or []:
            out.append({
                "_id": str(m["id"]),
                "id": str(m["id"]),
                "conversation_id": str(m["conversation_id"]),
                "sender_id": str(m["sender_id"]),
                "content": m["content"],
                "is_read": m.get("is_read", False),
                "read_at": m.get("read_at"),
                "created_at": m.get("created_at"),
                "read_by": [str(m["sender_id"])] if not m.get("is_read") else [str(m["sender_id"]), "recipient"],
            })
        return out

    def find_one(self, filter_dict: dict) -> Optional[dict]:
        id_val = str(filter_dict.get("_id") or filter_dict.get("id"))
        res = supabase.table("messages").select("*").eq("id", id_val).limit(1).execute()
        if res.data:
            m = res.data[0]
            return {
                "_id": str(m["id"]),
                "id": str(m["id"]),
                "conversation_id": str(m["conversation_id"]),
                "sender_id": str(m["sender_id"]),
                "content": m["content"],
                "is_read": m.get("is_read", False),
                "read_at": m.get("read_at"),
                "created_at": m.get("created_at"),
                "read_by": [str(m["sender_id"])] if not m.get("is_read") else [str(m["sender_id"]), "recipient"],
            }
        return None

    def insert_one(self, doc: dict) -> InsertResult:
        res = supabase.table("messages").insert({
            "conversation_id": str(doc["conversation_id"]),
            "sender_id": str(doc["sender_id"]),
            "content": doc["content"],
            "is_read": False,
        }).execute()
        msg_id = str(res.data[0]["id"])
        try:
            supabase.table("conversations").update({
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", str(doc["conversation_id"])).execute()
        except Exception:
            pass
        return InsertResult(inserted_id=msg_id)

    def update_one(self, filter_dict: dict, update_dict: dict) -> UpdateResult:
        id_val = str(filter_dict.get("_id") or filter_dict.get("id"))
        set_dict = update_dict.get("$set", {})
        add_to_set = update_dict.get("$addToSet", {})
        updates = {}
        if "is_read" in set_dict:
            updates["is_read"] = set_dict["is_read"]
        if "read_at" in set_dict:
            val = set_dict["read_at"]
            updates["read_at"] = val.isoformat() if hasattr(val, "isoformat") else str(val)
        if "read_by" in add_to_set:
            updates["is_read"] = True
            if "read_at" not in updates:
                updates["read_at"] = datetime.now(timezone.utc).isoformat()

        if updates:
            supabase.table("messages").update(updates).eq("id", id_val).execute()
        return UpdateResult(modified_count=1)

    def count_documents(self, filter_dict: dict) -> int:
        res = self.find(filter_dict)
        return len(res)

    def delete_one(self, filter_dict: dict) -> UpdateResult:
        id_val = str(filter_dict.get("_id") or filter_dict.get("id"))
        supabase.table("messages").delete().eq("id", id_val).execute()
        return UpdateResult(modified_count=1)

    def delete_many(self, filter_dict: Optional[dict] = None) -> UpdateResult:
        if os.getenv("DATABASE_MODE", "").lower() == "mock":
            _mock_store["messages"].clear()
            return UpdateResult(modified_count=1)
        supabase.table("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        return UpdateResult(modified_count=1)


supabase_conversations_collection = SupabaseConversationsCollection()
supabase_messages_collection = SupabaseMessagesCollection()
