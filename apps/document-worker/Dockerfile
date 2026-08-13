FROM python:3.11-slim

# Install system dependencies for Tesseract OCR
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files
COPY pyproject.toml ./

# Install Python dependencies
RUN pip install --no-cache-dir -e .

# Copy application code
COPY app/ ./app/

# Expose port. PORT is overridable at runtime — Render and Cloud Run both
# inject their own PORT and expect the container to listen on it, which a
# hardcoded --port would silently ignore (this exact mismatch already broke
# core-api's Cloud Run deploy once: "container failed to start and listen
# on PORT" — Cloud Run's health check has no way to know the app picked a
# different port).
ENV PORT=8000
EXPOSE 8000

# Run with uvicorn. No --reload: this image is what gets deployed, and the
# reloader's file-watcher is dev-only overhead that never triggers on a
# static container filesystem — it just adds startup/memory cost here.
# Shell form (not exec-form CMD array) so $PORT actually expands.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
