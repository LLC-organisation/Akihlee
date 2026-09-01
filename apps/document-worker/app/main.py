"""
Akihlee Document Worker - OCR and Extraction Service

Receives document upload events pushed from a Pub/Sub subscription,
performs OCR/vision extraction, and reports results back to Core API.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.services.document_processor import DocumentProcessor
from app.services.ocr_service import OCRService
from app.services.vision_extraction_service import VisionExtractionService
from app.routers import health, pubsub


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Construct shared clients once at startup; clean up on shutdown."""
    ocr_service = OCRService()
    vision_service = (
        VisionExtractionService()
        if settings.VISION_EXTRACTION_ENABLED and settings.AWS_ACCESS_KEY_ID
        else None
    )
    app.state.document_processor = DocumentProcessor(ocr_service, vision_service)

    yield

    await app.state.document_processor.aclose()


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
app.include_router(pubsub.router, prefix="/internal/pubsub", tags=["pubsub"])


@app.get("/")
async def root():
    """Root endpoint - service info."""
    return {
        "service": "akihlee-document-worker",
        "version": "0.1.0",
        "status": "running",
    }
