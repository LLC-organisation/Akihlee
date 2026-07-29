"""OCR extraction service using Tesseract."""

import logging
from pathlib import Path
from typing import Any

import pytesseract
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)


class OCRService:
    """Handles OCR and field extraction from receipt/invoice images."""

    def __init__(self):
        if settings.TESSERACT_PATH:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_PATH

    async def extract_text(self, image_path: Path) -> str:
        """
        Extract raw text from image using Tesseract OCR.

        Args:
            image_path: Path to image file

        Returns:
            Extracted text
        """
        try:
            image = Image.open(image_path)
            text = pytesseract.image_to_string(image)
            return text
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            raise

    async def extract_receipt_fields(self, image_path: Path) -> dict[str, Any]:
        """
        Extract structured fields from a receipt image.

        This is a simplified implementation. In production, you would:
        1. Use more sophisticated OCR (AWS Textract, Google Document AI)
        2. Apply regex patterns to extract amounts, dates, merchant names
        3. Use LLM for structured extraction with confidence scores

        Returns:
            Dictionary with extracted fields and confidence scores
        """
        raw_text = await self.extract_text(image_path)

        # Placeholder extraction logic
        # TODO: Implement actual field extraction with regex/LLM
        return {
            "raw_text": raw_text,
            "merchant": None,
            "total_amount": None,
            "currency": "KES",  # Default
            "date": None,
            "tax_amount": None,
            "line_items": [],
            "confidence": 0.5,  # Placeholder
            "status": "extracted" if raw_text else "failed",
        }
