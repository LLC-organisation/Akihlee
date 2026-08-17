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
# This is the single-column fallback — see _MULTI_COLUMN_BANK_LINE_PATTERN
# below for the (more common) table layout with a separate running-balance
# column, which is tried first.
_BANK_LINE_PATTERN = re.compile(
    r"^(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(?P<desc>.+?)\s+"
    r"(?P<sign>-)?(?P<amount>[\d,]+\.\d{2})\s*$"
)

# A multi-column statement row: date, description, a transaction amount,
# and a trailing running balance — e.g. "08/01 Deposit - Toast POS Daily
# Batch $3,215.60 $23,950.00" or "08/02 ACH Debit - Sysco Foods $1,920.34
# $22,029.66". The date here is often just MM/DD (no year printed per row —
# see _infer_statement_year), unlike the single-column pattern above.
_MULTI_COLUMN_BANK_LINE_PATTERN = re.compile(
    r"^(?P<date>\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+"
    r"(?P<desc>.+?)\s+"
    r"\$?(?P<val1>[\d,]+\.\d{2})\s+"
    r"\$?(?P<val2>[\d,]+\.\d{2})\s*$"
)

# Keyword signals for which column a multi-column row's val1 belongs to,
# since (unlike the single-column pattern) there's no unary minus sign to
# read the direction off of directly.
_EXPENSE_KEYWORD_PATTERN = re.compile(
    r"\b(debit|check|chk|purchase|payout|payroll|withdraw|ach\s*debit|pos\s*purchase|fee|charge)\b",
    re.IGNORECASE,
)

_BEGINNING_BALANCE_PATTERN = re.compile(r"(?:beginning|opening)\s+balance[^\d]{0,10}([\d,]+\.\d{2})", re.IGNORECASE)
_ENDING_BALANCE_PATTERN = re.compile(r"(?:ending|closing)\s+balance[^\d]{0,10}([\d,]+\.\d{2})", re.IGNORECASE)
_YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")

# Used by _parse_date_token_with_year for the multi-column pattern's dates,
# both the common yearless "MM/DD" case and full "MM/DD/YYYY" rows.
# Deliberately month-first throughout (unlike _DATE_FORMATS above, which
# tries day-first formats first) — this path is specifically for bank
# statement rows, and this pattern's own example rows are US-formatted
# (e.g. "08/01" means 1 August, not 8 January). %Y/%y formats are listed
# so a row that does print a full date is still read directly rather than
# routed through the fallback-year logic below.
_BANK_STATEMENT_DATE_FORMATS = ["%m/%d/%Y", "%m/%d/%y", "%m/%d", "%d/%m/%Y", "%d/%m/%y", "%d/%m"]

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

        This is the fallback path — VisionExtractionService (Claude Sonnet
        4.5 on Bedrock) is tried first when AWS credentials are configured;
        QueueConsumer only falls back to this rule-based pipeline when
        that's unset, disabled, or its call/response fails.
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
        # Matches VisionExtractionService's own schema contract (line_items
        # is always empty for BANK_STATEMENT) — without this guard, a
        # statement row ending in a balance figure gets misread as a
        # purchased line item, since this regex has no concept of "this
        # document is a table of transactions, not a line-itemized receipt".
        line_items = self._extract_line_items(lines) if document_type != "BANK_STATEMENT" else []

        bank_transactions: list[dict[str, Any]] = []
        beginning_balance: float | None = None
        ending_balance: float | None = None
        if document_type == "BANK_STATEMENT":
            statement_year = self._infer_statement_year(raw_text)
            # Multi-column (date, amount, running balance) is the more
            # common real-world layout — see _extract_bank_transactions_multi_column
            # — so it's tried first; only fall back to the single trailing-
            # amount pattern if that finds nothing, to avoid emitting
            # duplicate rows for the same statement.
            bank_transactions = self._extract_bank_transactions_multi_column(lines, statement_year)
            if not bank_transactions:
                bank_transactions = self._extract_bank_transactions(lines)
            beginning_balance = self._extract_amount(_BEGINNING_BALANCE_PATTERN, raw_text)
            ending_balance = self._extract_amount(_ENDING_BALANCE_PATTERN, raw_text)

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
            "document_type": document_type,
            "beginning_balance": beginning_balance,
            "ending_balance": ending_balance,
            "line_items": line_items,
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
        """Single trailing-amount fallback — no separate running-balance
        column. Loose on purpose: statement layouts vary a lot, and any
        line that doesn't match a leading date + trailing amount is
        skipped rather than guessed at.
        """
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
            is_expense = match.group("sign") is not None or _EXPENSE_KEYWORD_PATTERN.search(line)

            transactions.append({
                "transactionDate": date,
                "description": description,
                "payeeOrPayer": description,
                # Signed convention (positive=income, negative=expense),
                # matching VisionExtractionService and reconciliation.py.
                "amount": -amount if is_expense else amount,
                "type": "EXPENSE" if is_expense else "INCOME",
                "balance": None,  # this pattern has no running-balance column
                "category": "Uncategorized",
                "categoryConfidence": 0.0,
            })
        return transactions[:200]

    @staticmethod
    def _extract_bank_transactions_multi_column(lines: list[str], statement_year: int) -> list[dict[str, Any]]:
        """Handles the common statement table layout with a trailing
        transaction-amount column AND a running-balance column, e.g.
        "08/01 Deposit - Toast POS Daily Batch $3,215.60 $23,950.00" or
        "08/02 ACH Debit - Sysco Foods $1,920.34 $22,029.66". val1 is the
        transaction amount, val2 the running balance after it.

        Tried before the single-column _extract_bank_transactions — see
        extract_receipt_fields — since this is the more common real-world
        layout (Deposits/Withdrawals + a Balance column) that the plain
        single-amount pattern can't capture at all.
        """
        transactions: list[dict[str, Any]] = []
        for line in lines:
            match = _MULTI_COLUMN_BANK_LINE_PATTERN.match(line)
            if not match:
                continue
            date = OCRService._parse_date_token_with_year(match.group("date"), statement_year)
            if not date:
                continue

            amount = float(match.group("val1").replace(",", ""))
            balance = float(match.group("val2").replace(",", ""))
            description = match.group("desc").strip(" -\t")
            is_expense = bool(_EXPENSE_KEYWORD_PATTERN.search(line))

            transactions.append({
                "transactionDate": date,
                "description": description,
                "payeeOrPayer": description,
                "amount": -amount if is_expense else amount,
                "type": "EXPENSE" if is_expense else "INCOME",
                "balance": balance,
                "category": "Uncategorized",
                "categoryConfidence": 0.0,
            })
        return transactions[:200]

    @staticmethod
    def _infer_statement_year(text: str) -> int:
        """Multi-column statement rows are often printed as MM/DD with no
        year (the year lives in the statement header/period instead) — this
        finds a plausible one to fill in, defaulting to the current year if
        none is printed anywhere in the document."""
        match = _YEAR_PATTERN.search(text)
        if match:
            return int(match.group(1))
        return datetime.now().year

    @staticmethod
    def _parse_date_token_with_year(raw: str, fallback_year: int) -> str | None:
        """Parses a bank-statement date column: either a full "MM/DD/YYYY"
        row or a yearless "MM/DD" one (filling in fallback_year). Uses
        _BANK_STATEMENT_DATE_FORMATS rather than delegating to the generic
        _parse_date_token — that method tries day-first formats first,
        which would misread a full US-style "08/01/2026" row as 8 January
        instead of 1 August; this path needs month-first consistently for
        both the 2- and 3-component cases.
        """
        for fmt in _BANK_STATEMENT_DATE_FORMATS:
            try:
                parsed = datetime.strptime(raw, fmt)
            except ValueError:
                continue
            if "%Y" not in fmt and "%y" not in fmt:
                parsed = parsed.replace(year=fallback_year)
            return parsed.date().isoformat()
        return None
