"""Health check endpoints for monitoring."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def health_check():
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "document-worker"}


@router.get("/ready")
async def readiness_check():
    """Readiness check - verifies worker can process documents."""
    # TODO: Check S3 connection, etc.
    return {
        "status": "ready",
        "checks": {
            "storage": "connected",  # Placeholder
        },
    }
