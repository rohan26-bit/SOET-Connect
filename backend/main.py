from fastapi import FastAPI

from database import test_database_connection
from routes.auth import router as auth_router


app = FastAPI(
    title="SOET Connect API",
    description="Backend API for the SOET Connect Alumni Portal",
    version="1.0.0"
)


app.include_router(auth_router)


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