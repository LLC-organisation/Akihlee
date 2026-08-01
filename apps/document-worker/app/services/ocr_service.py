"""OCR extraction service using Tesseract."""

import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import pytesseract
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

# Common receipt date formats, tried in order.
_DATE_FORMATS = [
    "%d/%m/%Y", "%d/%m/%y", "%m/%d/%Y", "%m/%d/%y",
    "%Y-%m-%d", "%d-%m-%Y", "%d %b %Y", "%d %B %Y",
]
_DATE_PATTERN = re.compile(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b")
_TOTAL_LINE_PATTERN = re.compile(r"(?<!sub)(?<!sub )total[^\d]{0,10}([\d,]+\.\d{2})", re.IGNORECASE)
_TAX_LINE_PATTERN = re.compile(r"(?:tax|vat)[^\d]{0,10}([\d,]+\.\d{2})", re.IGNORECASE)
_AMOUNT_PATTERN = re.compile(r"\d[\d,]*\.\d{2}")
_CURRENCY_SYMBOLS = {"$": "USD", "€": "EUR", "£": "GBP", "ksh": "KES", "kes": "KES"}


class OCRService:
    """Handles OCR and field extraction from receipt/invoice images."""

    def __init__(self):
        if settings.TESSERACT_PATH:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_PATH

    async def extract_text(self, image_path: Path) -> str:
        """Extract raw text from an image using Tesseract OCR."""
        try:
            image = Image.open(image_path)
            return pytesseract.image_to_string(image)
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            raise

    async def extract_receipt_fields(self, image_path: Path) -> dict[str, Any]:
        """
        Extract structured fields from a receipt image using Tesseract OCR
        plus regex/heuristic parsing of the raw text.

        This is intentionally rule-based rather than LLM-based: no
        OPENAI_API_KEY/ANTHROPIC_API_KEY is configured for this project yet.
        If one is added later, this is the natural place to swap in a real
        structured-extraction call for higher accuracy.
        """
        raw_text = await self.extract_text(image_path)
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

        merchant = lines[0] if lines else None
        total_amount = self._extract_total(raw_text)
        tax_amount = self._extract_amount(_TAX_LINE_PATTERN, raw_text)
        date = self._extract_date(raw_text)
        currency = self._extract_currency(raw_text)
        line_items = self._extract_line_items(lines)

        fields_found = sum(1 for f in (merchant, total_amount, date) if f is not None)
        confidence = round(fields_found / 3, 2)
        if line_items:
            confidence = min(1.0, confidence + 0.1)

        return {
            "raw_text": raw_text,
            "merchant": merchant,
            "total_amount": total_amount,
            "currency": currency,
            "date": date,
            "tax_amount": tax_amount,
            "line_items": line_items,
            "confidence": confidence,
            "status": "extracted" if raw_text.strip() else "failed",
        }

    @staticmethod
    def _extract_total(text: str) -> float | None:
        match = _TOTAL_LINE_PATTERN.search(text)
        if match:
            return float(match.group(1).replace(",", ""))
        # Fallback: assume the largest currency-shaped number is the total.
        amounts = [float(a.replace(",", "")) for a in _AMOUNT_PATTERN.findall(text)]
        return max(amounts) if amounts else None

    @staticmethod
    def _extract_amount(pattern: re.Pattern, text: str) -> float | None:
        match = pattern.search(text)
        return float(match.group(1).replace(",", "")) if match else None

    @staticmethod
    def _extract_date(text: str) -> str | None:
        match = _DATE_PATTERN.search(text)
        if not match:
            return None
        raw = match.group(1)
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(raw, fmt).date().isoformat()
            except ValueError:
                continue
        return None

    @staticmethod
    def _extract_currency(text: str) -> str:
        lowered = text.lower()
        for symbol, code in _CURRENCY_SYMBOLS.items():
            if symbol in lowered:
                return code
        return "KES"  # Default market for this project

    @staticmethod
    def _extract_line_items(lines: list[str]) -> list[str]:
        # Heuristic: a line ending in a price that isn't the total/tax line.
        items = []
        for line in lines:
            if re.search(r"\d+\.\d{2}\s*$", line) and not re.search(
                r"total|tax|vat|subtotal|change|cash|balance", line, re.IGNORECASE
            ):
                items.append(line)
        return items[:20]
