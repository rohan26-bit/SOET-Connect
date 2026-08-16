import os
import certifi
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME")

if not MONGODB_URL:
    raise ValueError("MONGODB_URL is not set in .env")

if not DATABASE_NAME:
    raise ValueError("DATABASE_NAME is not set in .env")

client = MongoClient(
    MONGODB_URL,
    tls=True,
    tlsCAFile=certifi.where()
)
database = client[DATABASE_NAME]

users_collection = database["users"]


def test_database_connection():
    try:
        client.admin.command("ping")
        return True
    except Exception as e:
        print("MONGODB ERROR:", e)
        return False