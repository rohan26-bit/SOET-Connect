import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import test_database_connection
from routes.auth import router as auth_router
from routes.profile import router as profile_router
from routes.alumni import router as alumni_router
from routes.jobs import router as jobs_router
from routes.applications import router as applications_router
from routes.events import router as events_router
from routes.announcements import router as announcements_router
from routes.notifications import router as notifications_router
from routes.admin import router as admin_router
from routes.chat import router as chat_router


app = FastAPI(
    title="SOET Connect API",
    description="Backend API for the SOET Connect Alumni Portal",
    version="1.0.0"
)

DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

raw_origins = os.getenv("ALLOWED_ORIGINS", "")
configured_origins = [
    origin.strip()
    for origin in raw_origins.split(",")
    if origin.strip()
]

allowed_origins = list(dict.fromkeys(DEFAULT_ORIGINS + configured_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(alumni_router)
app.include_router(jobs_router)
app.include_router(applications_router)
app.include_router(events_router)
app.include_router(announcements_router)
app.include_router(notifications_router)
app.include_router(admin_router)
app.include_router(chat_router)

@app.get("/")
def root():
    return {
        "message": "SOET Connect API is running!",
        "status": "success"
    }


@app.get("/health")
def health_check():
    database_status = test_database_connection()

    return {
        "api": "healthy",
        "database": "connected" if database_status else "disconnected"
    }