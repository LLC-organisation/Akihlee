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
# MVP only serves the US and Kenyan markets, so this is deliberately just
# USD/KES signals rather than a general currency-symbol table.
_CURRENCY_SYMBOLS = {
    "$": "USD", "usd": "USD",
    "ksh": "KES", "kshs": "KES", "kes": "KES", "/=": "KES",
}

# Leading "2 x " / "2× " on a line item, so quantity/unit price can be split
# out from the trailing total price when the receipt prints it that way.
_QTY_PREFIX_PATTERN = re.compile(r"^(\d+(?:\.\d+)?)\s*[x×]\s*", re.IGNORECASE)

# A bank statement transaction line: a leading date, a free-text
# description, and a trailing signed amount (e.g. "12/03/2026 POS PURCHASE
# STORE 4 -1,250.00"). Deliberately loose since statement layouts vary a lot.
_BANK_LINE_PATTERN = re.compile(
    r"^(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(?P<desc>.+?)\s+"
    r"(?P<sign>-)?(?P<amount>[\d,]+\.\d{2})\s*$"
)

_BANK_STATEMENT_KEYWORDS = (
    "account statement", "statement of account", "opening balance",
    "closing balance", "account number", "sort code", "iban", "swift",
)
_INVOICE_KEYWORDS = ("invoice number", "invoice no", "bill to", "invoice date", "due date", "purchase order")


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

    async def extract_receipt_fields(self, image_paths: Path | list[Path]) -> dict[str, Any]:
        """
        Extract structured fields from one or more receipt/invoice page
        images using Tesseract OCR plus regex/heuristic parsing of the raw
        text. Multiple pages (e.g. a multi-page PDF statement) are OCR'd
        individually and their text concatenated before field extraction,
        so a total/tax on a later page or line items spread across pages
        are still picked up by the same heuristics.

        This is intentionally rule-based rather than LLM-based: no
        OPENAI_API_KEY/ANTHROPIC_API_KEY is configured for this project yet.
        If one is added later, this is the natural place to swap in a real
        structured-extraction call for higher accuracy.
        """
        pages = [image_paths] if isinstance(image_paths, Path) else image_paths
        page_texts = [await self.extract_text(page) for page in pages]
        raw_text = "\n\n".join(page_texts)
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

        document_type = self._classify_document_type(raw_text)

        merchant = lines[0] if lines else None
        total_amount = self._extract_total(raw_text)
        tax_amount = self._extract_amount(_TAX_LINE_PATTERN, raw_text)
        date = self._extract_date(raw_text)
        currency = self._extract_currency(raw_text)
        line_items = self._extract_line_items(lines)
        bank_transactions = (
            self._extract_bank_transactions(lines) if document_type == "BANK_STATEMENT" else []
        )

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
            "document_type": document_type,
            "bank_transactions": bank_transactions,
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
        return OCRService._parse_date_token(match.group(1))

    @staticmethod
    def _parse_date_token(raw: str) -> str | None:
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
    def _extract_line_items(lines: list[str]) -> list[dict[str, Any]]:
        # Heuristic: a line ending in a price that isn't the total/tax line.
        # SKU/category/taxability aren't inferable from OCR text alone, so
        # those are left null for a person to fill in during review.
        items: list[dict[str, Any]] = []
        for line in lines:
            match = re.search(r"([\d,]+\.\d{2})\s*$", line)
            if not match or re.search(
                r"total|tax|vat|subtotal|change|cash|balance", line, re.IGNORECASE
            ):
                continue

            total_price = float(match.group(1).replace(",", ""))
            description = line[: match.start()].strip(" -\t")

            quantity = None
            unit_price = None
            qty_match = _QTY_PREFIX_PATTERN.match(description)
            if qty_match:
                qty_value = float(qty_match.group(1))
                if qty_value > 0:
                    quantity = qty_value
                    unit_price = round(total_price / qty_value, 2)
                    description = description[qty_match.end():].strip()

            items.append({
                "itemName": None,  # not distinguishable from description via regex alone
                "description": description or line,
                "sku": None,
                "quantity": quantity,
                "unitPrice": unit_price,
                "totalPrice": total_price,
                "categoryTag": None,
                "isTaxable": None,
            })
        return items[:20]

    @staticmethod
    def _classify_document_type(text: str) -> str:
        lowered = text.lower()
        if any(kw in lowered for kw in _BANK_STATEMENT_KEYWORDS):
            return "BANK_STATEMENT"
        if "invoice" in lowered or any(kw in lowered for kw in _INVOICE_KEYWORDS):
            return "INVOICE"
        return "RECEIPT"

    @staticmethod
    def _extract_bank_transactions(lines: list[str]) -> list[dict[str, Any]]:
        # Loose on purpose: statement layouts vary a lot, and any line that
        # doesn't match a leading date + trailing amount is skipped rather
        # than guessed at.
        transactions: list[dict[str, Any]] = []
        for line in lines:
            match = _BANK_LINE_PATTERN.match(line)
            if not match:
                continue
            date = OCRService._parse_date_token(match.group("date"))
            if not date:
                continue

            amount = float(match.group("amount").replace(",", ""))
            description = match.group("desc").strip()
            is_expense = match.group("sign") is not None or re.search(
                r"\bdebit\b|\bdb\b|\bwithdrawal\b", line, re.IGNORECASE
            )

            transactions.append({
                "transactionDate": date,
                "description": description,
                "payeeOrPayer": description,
                "amount": amount,
                "type": "EXPENSE" if is_expense else "INCOME",
                "category": "Uncategorized",
            })
        return transactions[:200]
