import os
import uuid

from dotenv import load_dotenv
from pymongo import MongoClient
import certifi
from pwdlib import PasswordHash


load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME")

password_hash = PasswordHash.recommended()


# ============================================================
# LOCAL DEVELOPMENT FALLBACK
# ============================================================

class LocalInsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class LocalUsersCollection:
    def __init__(self):
        self.users = []

        # Demo student account
        self.users.append({
            "_id": "demo-student-id",
            "name": "Demo Student",
            "email": "test@student.com",
            "password_hash": password_hash.hash("Test@12345"),
            "role": "student",
            "is_active": True,
            "is_verified": True,
        })

        # Demo alumni account
        self.users.append({
            "_id": "demo-alumni-id",
            "name": "Demo Alumni",
            "email": "test@alumni.com",
            "password_hash": password_hash.hash("Test@12345"),
            "role": "alumni",
            "is_active": True,
            "is_verified": True,
            "verification_status": "approved",
        })

        # Demo admin account
        self.users.append({
            "_id": "demo-admin-id",
            "name": "Demo Admin",
            "email": "test@admin.com",
            "password_hash": password_hash.hash("Test@12345"),
            "role": "admin",
            "is_active": True,
            "is_verified": True,
        })

    def find_one(self, query):
        for user in self.users:
            if all(
                user.get(key) == value
                for key, value in query.items()
            ):
                return user

        return None

    def find(self, query):
        results = []

        for user in self.users:
            matches = True

            for key, value in query.items():
                if user.get(key) != value:
                    matches = False
                    break

            if matches:
                results.append(user)

        return results

    def insert_one(self, document):
        document["_id"] = str(uuid.uuid4())
        self.users.append(document)

        return LocalInsertResult(document["_id"])

    def update_one(self, query, update):
        for user in self.users:
            matches = all(
                user.get(key) == value
                for key, value in query.items()
            )

            if matches:
                if "$set" in update:
                    for key, value in update["$set"].items():
                        user[key] = value

                return True

        return False


# ============================================================
# MONGODB CONNECTION
# ============================================================

mongo_available = False
client = None
database = None

try:
    if not MONGODB_URL:
        raise ValueError("MONGODB_URL is not set in .env")

    if not DATABASE_NAME:
        raise ValueError("DATABASE_NAME is not set in .env")

    client = MongoClient(
        MONGODB_URL,
        tls=True,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=3000,
        connectTimeoutMS=3000,
        socketTimeoutMS=3000,
    )

    client.admin.command("ping")

    database = client[DATABASE_NAME]
    users_collection = database["users"]

    mongo_available = True

    print("MongoDB: CONNECTED")

except Exception as e:
    print("MongoDB unavailable - using LOCAL DEVELOPMENT DATABASE")
    print("MongoDB error:", e)

    users_collection = LocalUsersCollection()


# ============================================================
# DATABASE HEALTH CHECK
# ============================================================

def test_database_connection():
    if mongo_available:
        try:
            client.admin.command("ping")
            return True
        except Exception as e:
            print("MONGODB ERROR:", e)
            return False

    return False