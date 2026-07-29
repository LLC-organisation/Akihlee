"""
Akihlee Document Worker - OCR and Extraction Service

Consumes document upload events from RabbitMQ, performs OCR extraction,
and publishes results back to the queue for the Core API to process.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.services.queue_consumer import QueueConsumer
from app.services.ocr_service import OCRService
from app.routers import health

# Initialize services at startup
queue_consumer: QueueConsumer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage service lifecycle - start queue consumer on startup, clean up on shutdown."""
    global queue_consumer

    # Startup: Initialize queue consumer
    ocr_service = OCRService()
    queue_consumer = QueueConsumer(ocr_service)
    await queue_consumer.start()

    yield

    # Shutdown: Close connections
    if queue_consumer:
        await queue_consumer.stop()


# Create FastAPI application
app = FastAPI(
    title="Akihlee Document Worker",
    description="OCR and document extraction service",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/health", tags=["health"])


@app.get("/")
async def root():
    """Root endpoint - service info."""
    return {
        "service": "akihlee-document-worker",
        "version": "0.1.0",
        "status": "running",
    }
