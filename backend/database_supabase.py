"""
SOET Connect — Supabase PostgreSQL Database Adapter
===================================================
Provides PostgREST API client and collection-compatible interfaces
for Supabase PostgreSQL tables while preserving existing application logic.
"""

import os
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

DEFAULT_SUPABASE_URL = "https://riddvkapqnmjsawyzfdb.supabase.co"


def get_supabase_config() -> dict:
    """Resolve Supabase connection configuration from environment variables."""
    url = (
        os.getenv("SUPABASE_URL", "").strip()
        or DEFAULT_SUPABASE_URL
    )
    service_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_KEY", "").strip()
    )
    anon_key = (
        os.getenv("SUPABASE_ANON_KEY", "").strip()
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
    try:
        with httpx.Client(timeout=6.0) as client:
            resp = client.get(
                f"{SUPABASE_REST_URL}/users?limit=1",
                headers=get_headers(),
            )
            return resp.status_code == 200
    except Exception as e:
        print(f"SUPABASE CONNECTION ERROR: {type(e).__name__} - {e}")
        return False


# ==============================================================================
# SUPABASE POSTGREST QUERY BUILDER
# ==============================================================================

class QueryResult:
    """Encapsulates PostgREST response data."""
    def __init__(self, data: Any, count: Optional[int] = None, status_code: int = 200):
        self.data = data
        self.count = count
        self.status_code = status_code


class SupabaseQueryBuilder:
    """Fluent query builder for Supabase PostgREST tables."""

    def __init__(self, table_name: str, base_url: str = SUPABASE_REST_URL, timeout: float = 10.0):
        self.table_name = table_name
        self.base_url = f"{base_url}/{table_name}"
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

    def insert(self, record_or_records: Union[dict, list]) -> 'SupabaseInsertBuilder':
        return SupabaseInsertBuilder(self.base_url, record_or_records, self.headers, self.timeout)

    def update(self, values: dict) -> 'SupabaseUpdateBuilder':
        return SupabaseUpdateBuilder(self.base_url, values, self.headers, self.timeout)

    def delete(self) -> 'SupabaseDeleteBuilder':
        return SupabaseDeleteBuilder(self.base_url, self.headers, self.timeout)


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



class SupabaseUpdateBuilder:
    def __init__(self, base_url: str, values: dict, headers: dict, timeout: float):
        self.base_url = base_url
        self.values = values
        self.headers = headers
        self.timeout = timeout
        self.params: Dict[str, str] = {}

    def eq(self, column: str, value: Any):
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

    def eq(self, column: str, value: Any):
        self.params[column] = f"eq.{value}"
        return self

    def execute(self) -> QueryResult:
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.delete(self.base_url, headers=self.headers, params=self.params)
            if not resp.is_success:
                raise RuntimeError(f"Supabase delete failed ({resp.status_code}): {resp.text}")
            return QueryResult(data=resp.json(), status_code=resp.status_code)


class SupabaseClient:
    """Primary client instance for accessing Supabase PostgreSQL."""
    def table(self, table_name: str) -> SupabaseQueryBuilder:
        return SupabaseQueryBuilder(table_name)

    def from_(self, table_name: str) -> SupabaseQueryBuilder:
        return SupabaseQueryBuilder(table_name)


supabase = SupabaseClient()


# ==============================================================================
# COLLECTION-COMPATIBLE ADAPTER FOR USERS
# ==============================================================================

class InsertResult:
    def __init__(self, inserted_id: str):
        self.inserted_id = inserted_id


class UpdateResult:
    def __init__(self, modified_count: int):
        self.modified_count = modified_count


class SupabaseUsersCollection:
    """
    Drop-in compatibility adapter replicating PyMongo's users_collection interface
    backed directly by the Supabase PostgreSQL `users`, `student_profiles`,
    and `alumni_profiles` tables.
    """

    def _format_user_output(self, user_row: dict) -> dict:
        """Combine user record with linked student/alumni profile into expected application shape."""
        if not user_row:
            return None

        user_id = str(user_row.get("id"))
        doc = {
            "_id": user_id,
            "id": user_id,
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
        q = supabase.table("users").select("*")

        if not filter_dict:
            res = q.limit(1).execute()
            return self._format_user_output(res.data[0]) if res.data else None

        # Filter by email
        if "email" in filter_dict:
            email_val = str(filter_dict["email"]).lower().strip()
            res = q.eq("email", email_val).limit(1).execute()
            return self._format_user_output(res.data[0]) if res.data else None

        # Filter by _id or id
        id_val = filter_dict.get("_id") or filter_dict.get("id")
        if id_val:
            id_str = str(id_val).strip()
            # Try UUID id
            res = q.eq("id", id_str).limit(1).execute()
            if res.data:
                return self._format_user_output(res.data[0])
            # Try legacy_mongo_id
            res_legacy = supabase.table("users").select("*").eq("legacy_mongo_id", id_str).limit(1).execute()
            if res_legacy.data:
                return self._format_user_output(res_legacy.data[0])
            return None

        # Filter by role
        if "role" in filter_dict:
            res = q.eq("role", filter_dict["role"]).limit(1).execute()
            return self._format_user_output(res.data[0]) if res.data else None

        return None

    def find(self, filter_dict: Optional[dict] = None) -> list:
        """Find user documents matching the filter criteria."""
        q = supabase.table("users").select("*")

        if filter_dict:
            if "role" in filter_dict:
                q = q.eq("role", filter_dict["role"])
            if "is_active" in filter_dict:
                q = q.eq("is_active", filter_dict["is_active"])
            if "is_verified" in filter_dict:
                q = q.eq("is_verified", filter_dict["is_verified"])

        res = q.execute()
        return [self._format_user_output(row) for row in res.data]

    def insert_one(self, doc: dict) -> InsertResult:
        """Insert a user document into users and linked profile tables."""
        user_row = {
            "name": doc.get("name"),
            "email": str(doc.get("email", "")).lower().strip(),
            "password_hash": doc.get("password_hash"),
            "role": doc.get("role"),
            "avatar_url": doc.get("avatar_url"),
            "is_active": doc.get("is_active", True),
            "is_verified": doc.get("is_verified", False),
            "verification_status": doc.get("verification_status", "pending"),
        }

        # If _id was already set (e.g. from legacy migration)
        if "_id" in doc and doc["_id"]:
            user_row["legacy_mongo_id"] = str(doc["_id"])

        res = supabase.table("users").insert(user_row).execute()
        if not res.data:
            raise RuntimeError("Failed to insert user into Supabase users table.")

        created_user = res.data[0]
        user_id = created_user["id"]

        # Insert linked profile
        role = created_user.get("role")
        if role == "student" and "student_profile" in doc:
            sp = doc.get("student_profile", {}) or {}
            supabase.table("student_profiles").insert({
                "user_id": user_id,
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
                "user_id": user_id,
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

        return InsertResult(inserted_id=user_id)

    def update_one(self, filter_dict: dict, update_dict: dict) -> UpdateResult:
        """Update a user record and any embedded profile fields."""
        target_user = self.find_one(filter_dict)
        if not target_user:
            return UpdateResult(modified_count=0)

        user_id = target_user["id"]
        set_fields = update_dict.get("$set", {})

        # Base user fields
        base_updates = {}
        for k in ["name", "email", "password_hash", "avatar_url", "is_active", "is_verified", "verification_status"]:
            if k in set_fields:
                base_updates[k] = set_fields[k]

        if base_updates:
            supabase.table("users").update(base_updates).eq("id", user_id).execute()

        # Update student profile fields
        if "student_profile" in set_fields:
            sp = set_fields["student_profile"]
            prof_updates = {
                k: sp[k] for k in ["student_id", "department", "course", "academic_year", "graduation_year", "phone"]
                if k in sp
            }
            if prof_updates:
                supabase.table("student_profiles").update(prof_updates).eq("user_id", user_id).execute()

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
                supabase.table("alumni_profiles").update(prof_updates).eq("user_id", user_id).execute()

        return UpdateResult(modified_count=1)

    def delete_one(self, filter_dict: dict) -> UpdateResult:
        """Delete a single user record."""
        target_user = self.find_one(filter_dict)
        if not target_user:
            return UpdateResult(modified_count=0)

        user_id = target_user["id"]
        supabase.table("users").delete().eq("id", user_id).execute()
        return UpdateResult(modified_count=1)


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
        conv_id = created["id"]

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

    def create_index(self, *args, **kwargs):
        pass

    def delete_many(self, filter_dict: Optional[dict] = None):
        return UpdateResult(modified_count=0)

    def delete_one(self, filter_dict: dict):
        return UpdateResult(modified_count=0)


class SupabaseMessagesCollection:
    """Drop-in collection interface for Supabase messages table."""

    def create_index(self, *args, **kwargs):
        pass

    def delete_many(self, filter_dict: Optional[dict] = None):
        return UpdateResult(modified_count=0)

    def delete_one(self, filter_dict: dict):
        return UpdateResult(modified_count=0)

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
            }
        return None

    def insert_one(self, doc: dict) -> InsertResult:
        res = supabase.table("messages").insert({
            "conversation_id": str(doc["conversation_id"]),
            "sender_id": str(doc["sender_id"]),
            "content": doc["content"],
            "is_read": False,
        }).execute()
        msg_id = res.data[0]["id"]
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
        updates = {}
        if "is_read" in set_dict:
            updates["is_read"] = set_dict["is_read"]
        if "read_at" in set_dict:
            updates["read_at"] = set_dict["read_at"]

        if updates:
            supabase.table("messages").update(updates).eq("id", id_val).execute()
        return UpdateResult(modified_count=1)

    def count_documents(self, filter_dict: dict) -> int:
        res = self.find(filter_dict)
        return len(res)


supabase_conversations_collection = SupabaseConversationsCollection()
supabase_messages_collection = SupabaseMessagesCollection()

