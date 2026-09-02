"""OCR extraction service using Tesseract."""

import logging
import re
from datetime import date, datetime
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
# [\d,.]+ (not just [\d,]+) so a misread thousands separator — Tesseract
# occasionally emits a period instead of a comma, e.g. "18.944.96" for
# "18,944.96" — is still captured here; _clean_amount below is what actually
# resolves which trailing ".XX" is the real decimal point.
_TOTAL_LINE_PATTERN = re.compile(r"(?<!sub)(?<!sub )total[^\d]{0,10}([\d,.]+\.\d{2})", re.IGNORECASE)
_TAX_LINE_PATTERN = re.compile(r"(?:tax|vat)[^\d]{0,10}([\d,.]+\.\d{2})", re.IGNORECASE)
_AMOUNT_PATTERN = re.compile(r"\d[\d,.]*\.\d{2}")
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
    r"(?P<sign>-)?(?P<amount>[\d,.]+\.\d{2})\s*$"
)

# A multi-column statement row: date, description, a transaction amount,
# and a trailing running balance — e.g. "08/01 Deposit - Toast POS Daily
# Batch $3,215.60 $23,950.00" or "08/02 ACH Debit - Sysco Foods $1,920.34
# $22,029.66". The date here is often just MM/DD (no year printed per row —
# see _infer_statement_year), unlike the single-column pattern above.
#
# val1's leading (?P<sign>-)? matters a lot: plenty of real statements
# (e.g. Chase) print the transaction amount itself signed — "-38.64" for a
# debit, no sign for a credit — in what's otherwise this same single
# amount + balance layout, not a separate unsigned Deposit/Withdrawal
# column. Without a sign group here, the "-" isn't whitespace so it can't
# be absorbed by the non-greedy desc group either, and the whole line
# fails to match this pattern at all — every negative-amount row (i.e.
# most withdrawals) would silently vanish rather than just lose its sign.
_MULTI_COLUMN_BANK_LINE_PATTERN = re.compile(
    r"^(?P<date>\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+"
    r"(?P<desc>.+?)\s+"
    r"(?P<sign>-)?\$?(?P<val1>[\d,.]+\.\d{2})\s+"
    r"\$?(?P<val2>[\d,.]+\.\d{2})\s*$"
)

# Tesseract sometimes wraps a long transaction row across two OR THREE
# physical lines — e.g. "08/01 Deposit - Toast POS Daily Batch" followed by
# a second line "$3,215.60 $23,950.00" carrying just the amount/balance, or
# (a real 3-line case) a description line, then an orphan line carrying
# just the card's last-4-digits suffix ("0707"), then the amount/balance
# line. Neither bank-line pattern above can match a row split like that;
# see _merge_wrapped_amount_lines, which uses these two patterns together
# to glue any non-date-leading continuation line onto a not-yet-"closed"
# (no trailing amount yet) previous line, so an orphan middle line like
# "0707" gets absorbed too, not just a pure bare-amounts line.
_LEADING_DATE_PATTERN = re.compile(r"^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b")
_TRAILING_AMOUNT_PATTERN = re.compile(r"[\d,.]+\.\d{2}\s*$")

# Keyword signals for which column a row's amount belongs to — the
# fallback used only when no explicit sign was printed/captured (an
# unsigned two-column Deposit/Withdrawal statement, or a wrapped/merged
# line the sign group didn't catch). Deliberately excludes "payout" — for
# an SME using Akihlee's Square integration, a "payout" line on a bank
# statement is money a payment processor deposited IN, not an expense.
# Also includes "payment to" — a person-to-person transfer (e.g. a Zelle
# payment) has no other expense-shaped keyword, but "payment to X" vs
# "payment from X" is a reliable directional cue on its own.
_EXPENSE_KEYWORD_PATTERN = re.compile(
    r"\b(debit|check|chk|purchase|payroll|withdraw|ach\s*debit|pos\s*purchase|fee|charge"
    r"|payment\s+to)\b",
    re.IGNORECASE,
)

# Overrides an expense-keyword match (e.g. "purchase") when no explicit
# sign was printed — a "Card Purchase Return" or "Purchase Refund" line is
# a credit despite containing "purchase", and real statements print these
# with no sign at all (same as an ordinary credit), so the keyword above
# would otherwise misclassify it as a withdrawal. Checked before
# _EXPENSE_KEYWORD_PATTERN in the sign-absent branch — see is_expense
# logic in _extract_bank_transactions/_extract_bank_transactions_multi_column.
_CREDIT_OVERRIDE_KEYWORD_PATTERN = re.compile(
    r"\b(return|refund|reversal|credit\s+adjustment)\b", re.IGNORECASE,
)

# Known vendor/payee name -> category, checked before falling back to
# "Uncategorized" — regex/Tesseract has no real categorization ability, but
# a handful of very common SME vendors are worth recognizing by name
# directly. Each entry's bool is whether that vendor is an expense; see
# _vendor_category, which only applies a match when it agrees with the
# row's own already-detected INCOME/EXPENSE direction, so a vendor name
# match never contradicts the sign/keyword signal that decided that.
_VENDOR_CATEGORY_MAP: tuple[tuple[re.Pattern, bool, str], ...] = (
    (re.compile(r"\b(toast|square|clover)\b", re.IGNORECASE), False, "Payment Processor Payout"),
    (re.compile(r"\b(doordash|uber\s*eats|grubhub|postmates)\b", re.IGNORECASE), False, "Delivery Platform Revenue"),
    (re.compile(r"\b(sysco|us\s*foods|restaurant\s*depot)\b", re.IGNORECASE), True, "Inventory & Raw Materials"),
    (re.compile(r"\b(gusto|adp|paychex)\b", re.IGNORECASE), True, "Payroll & Personnel"),
)

_BEGINNING_BALANCE_PATTERN = re.compile(r"(?:beginning|opening)\s+balance[^\d]{0,10}([\d,.]+\.\d{2})", re.IGNORECASE)
_ENDING_BALANCE_PATTERN = re.compile(r"(?:ending|closing)\s+balance[^\d]{0,10}([\d,.]+\.\d{2})", re.IGNORECASE)
_YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")

# A printed statement period, e.g. "August 16, 2023 through September 18,
# 2023" (Chase's own header format, repeated on every page) — used to
# resolve the correct year per-row instead of _infer_statement_year's
# single "first year found anywhere" guess, which breaks for a period that
# spans a year boundary (e.g. "December 20, 2025 through January 18,
# 2026": a Dec row belongs to 2025, a Jan row to 2026, but the naive
# single-year guess would misdate one or the other).
_STATEMENT_PERIOD_PATTERN = re.compile(
    r"([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*(?:through|thru|-|–|to)\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})",
    re.IGNORECASE,
)
_PERIOD_DATE_FORMATS = ["%B %d, %Y", "%B %d %Y", "%b %d, %Y", "%b %d %Y"]

# Used by _parse_date_token_with_year for the multi-column pattern's dates,
# both the common yearless "MM/DD" case and full "MM/DD/YYYY" rows.
# Deliberately month-first throughout (unlike _DATE_FORMATS above, which
# tries day-first formats first) — this path is specifically for bank
# statement rows, and this pattern's own example rows are US-formatted
# (e.g. "08/01" means 1 August, not 8 January). %Y/%y formats are listed
# so a row that does print a full date is still read directly rather than
# routed through the fallback-year logic below.
_BANK_STATEMENT_DATE_FORMATS = ["%m/%d/%Y", "%m/%d/%y", "%m/%d", "%d/%m/%Y", "%d/%m/%y", "%d/%m"]

# Deliberately no literal bank names (e.g. "chase", "wells fargo") here —
# those show up on plenty of receipts too (a card brand printed on a POS
# receipt, an address near a bank branch), which would misclassify an
# ordinary receipt as a bank statement. These are all statement-structure
# terms that don't have that false-positive risk.
_BANK_STATEMENT_KEYWORDS = (
    "account statement", "statement of account", "opening balance",
    "closing balance", "beginning balance", "ending balance",
    "statement period", "account summary", "total deposits",
    "total withdrawals", "transaction history",
    "account number", "sort code", "iban", "swift",
)
_INVOICE_KEYWORDS = ("invoice number", "invoice no", "bill to", "invoice date", "due date", "purchase order")

# Real statements often lead with disclaimer/sample-document boilerplate or
# a generic title rather than the bank's own name — see
# OCRService._extract_bank_name, which scans for a line actually naming a
# financial institution instead of blindly taking the first line.
_BANK_NAME_PATTERN = re.compile(r"\b(bank|credit union|n\.?a\.?|trust company|financial)\b", re.IGNORECASE)
_DISCLAIMER_LINE_PATTERN = re.compile(r"\b(sample|test document|specimen|void|not a real)\b", re.IGNORECASE)


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
        DocumentProcessor only falls back to this rule-based pipeline when
        that's unset, disabled, or its call/response fails.
        """
        pages = [image_paths] if isinstance(image_paths, Path) else image_paths
        page_texts = [await self.extract_text(page) for page in pages]
        raw_text = "\n\n".join(page_texts)
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

        document_type = self._classify_document_type(raw_text)

        # A receipt/invoice's first line is almost always the merchant name;
        # a bank statement's often isn't (disclaimer/sample boilerplate or a
        # generic document title) — see _extract_bank_name.
        merchant = self._extract_bank_name(lines) if document_type == "BANK_STATEMENT" else (lines[0] if lines else None)
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
            statement_period = self._infer_statement_period(raw_text)
            statement_year = self._infer_statement_year(raw_text)
            # A printed period (e.g. "August 16, 2023 through September 18,
            # 2023") is a stronger date signal than the generic first-
            # date-in-the-document heuristic _extract_date used above — that
            # heuristic tends to land on the first transaction row's date
            # instead of the statement's own end date, since transaction
            # rows are usually printed before the period header repeats on
            # later pages. Matches VisionExtractionService's own contract
            # (BANK_STATEMENT's date = the period's end date).
            if statement_period is not None:
                date = statement_period[1].isoformat()
            # Recover rows Tesseract wrapped across two physical lines
            # before either transaction pattern below ever sees them.
            bank_lines = self._merge_wrapped_amount_lines(lines)
            # Multi-column (date, amount, running balance) is the more
            # common real-world layout — see _extract_bank_transactions_multi_column
            # — so it's tried first; only fall back to the single trailing-
            # amount pattern if that finds nothing, to avoid emitting
            # duplicate rows for the same statement.
            bank_transactions = self._extract_bank_transactions_multi_column(
                bank_lines, statement_year, statement_period
            )
            if not bank_transactions:
                bank_transactions = self._extract_bank_transactions(bank_lines)
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
    def _clean_amount(raw: str) -> float | None:
        """Parses a currency-shaped OCR token into a float, tolerating a
        misread thousands separator that came through as a period instead
        of a comma (e.g. Tesseract emitting "18.944.96" for "18,944.96") —
        the trailing "."+2 digits is always the real decimal point;
        anything before it is digit-grouping noise to strip, regardless of
        which punctuation mark it used.
        """
        cleaned = raw.strip().lstrip("$")
        decimal_match = re.search(r"\.(\d{2})$", cleaned)
        if not decimal_match:
            return None
        integer_part = re.sub(r"[.,]", "", cleaned[: decimal_match.start()])
        try:
            return float(f"{integer_part}.{decimal_match.group(1)}")
        except ValueError:
            return None

    @staticmethod
    def _extract_total(text: str) -> float | None:
        match = _TOTAL_LINE_PATTERN.search(text)
        if match:
            cleaned = OCRService._clean_amount(match.group(1))
            if cleaned is not None:
                return cleaned
        # Fallback: assume the largest currency-shaped number is the total.
        amounts = [a for a in (OCRService._clean_amount(t) for t in _AMOUNT_PATTERN.findall(text)) if a is not None]
        return max(amounts) if amounts else None

    @staticmethod
    def _extract_amount(pattern: re.Pattern, text: str) -> float | None:
        match = pattern.search(text)
        return OCRService._clean_amount(match.group(1)) if match else None

    @staticmethod
    def _resolve_is_expense(line: str, explicit_sign: str | None) -> bool:
        """An explicit "-" printed directly on the amount is authoritative
        and always wins — this is what makes a signed-single-column
        statement (e.g. Chase, where a debit is printed as "-38.64" right
        next to the row's own running balance) resolve correctly instead
        of falling through to keyword guessing. Only a row with no
        explicit sign (an unsigned two-column Deposit/Withdrawal
        statement) falls back to keywords, and even then a credit-shaped
        word (return/refund/...) overrides an otherwise-matching expense
        keyword like "purchase" in "Card Purchase Return".
        """
        if explicit_sign is not None:
            return True
        if _CREDIT_OVERRIDE_KEYWORD_PATTERN.search(line):
            return False
        return bool(_EXPENSE_KEYWORD_PATTERN.search(line))

    @staticmethod
    def _vendor_category(line: str, is_expense: bool) -> str | None:
        """Looks up a known vendor name in _VENDOR_CATEGORY_MAP, but only
        returns a match that agrees with is_expense — the row's own sign/
        keyword signal already decided INCOME vs EXPENSE, so a vendor name
        is only ever used to refine the category, never to override that.
        """
        for pattern, vendor_is_expense, category in _VENDOR_CATEGORY_MAP:
            if vendor_is_expense == is_expense and pattern.search(line):
                return category
        return None

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
            match = re.search(r"([\d,.]+\.\d{2})\s*$", line)
            if not match or re.search(
                r"total|tax|vat|subtotal|change|cash|balance", line, re.IGNORECASE
            ):
                continue

            total_price = OCRService._clean_amount(match.group(1))
            if total_price is None:
                continue
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
    def _extract_bank_name(lines: list[str]) -> str | None:
        """Scans the first several lines for one that actually names a
        financial institution, skipping disclaimer/sample-document
        boilerplate — unlike a receipt/invoice, a bank statement's first
        line is often a document title or "[SAMPLE / TEST DOCUMENT]" rather
        than the bank's own name, so lines[0] isn't a safe default here.
        Falls back to lines[0] if nothing more specific is found.
        """
        for line in lines[:10]:
            if _DISCLAIMER_LINE_PATTERN.search(line):
                continue
            if _BANK_NAME_PATTERN.search(line):
                return line
        return lines[0] if lines else None

    @staticmethod
    def _merge_wrapped_amount_lines(lines: list[str]) -> list[str]:
        """Stitches a continuation line back onto the previous line —
        recovers transaction rows Tesseract split across two OR three
        physical lines (see _LEADING_DATE_PATTERN/_TRAILING_AMOUNT_PATTERN
        above). A line is glued onto whatever's accumulated so far whenever
        it doesn't itself look like the start of a new row (no leading
        date) AND the accumulated line isn't already "closed" (doesn't yet
        end in a trailing amount) — the latter check is what keeps this
        from swallowing unrelated non-date text (a page footer, a table
        header) into an already-complete transaction row.
        """
        merged: list[str] = []
        for line in lines:
            if merged and not _LEADING_DATE_PATTERN.match(line) and not _TRAILING_AMOUNT_PATTERN.search(merged[-1]):
                merged[-1] = f"{merged[-1]} {line}"
            else:
                merged.append(line)
        return merged

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

            amount = OCRService._clean_amount(match.group("amount"))
            if amount is None:
                continue
            description = match.group("desc").strip()
            is_expense = OCRService._resolve_is_expense(line, match.group("sign"))

            transactions.append({
                "transactionDate": date,
                "description": description,
                "payeeOrPayer": description,
                # Signed convention (positive=income, negative=expense),
                # matching VisionExtractionService and reconciliation.py.
                "amount": -amount if is_expense else amount,
                "type": "EXPENSE" if is_expense else "INCOME",
                "balance": None,  # this pattern has no running-balance column
                "category": OCRService._vendor_category(line, is_expense) or "Uncategorized",
                "categoryConfidence": 0.0,
            })
        return transactions[:200]

    @staticmethod
    def _extract_bank_transactions_multi_column(
        lines: list[str], statement_year: int, statement_period: "tuple[date, date] | None" = None,
    ) -> list[dict[str, Any]]:
        """Handles the common statement table layout with a trailing
        transaction-amount column AND a running-balance column, e.g.
        "08/01 Deposit - Toast POS Daily Batch $3,215.60 $23,950.00" or
        "08/02 ACH Debit - Sysco Foods $1,920.34 $22,029.66". val1 is the
        transaction amount, val2 the running balance after it.

        Tried before the single-column _extract_bank_transactions — see
        extract_receipt_fields — since this is the more common real-world
        layout (Deposits/Withdrawals + a Balance column) that the plain
        single-amount pattern can't capture at all.

        statement_period, when available, resolves a yearless "MM/DD" row's
        year against the printed period's own start/end years rather than
        always assuming statement_year — the only case they can differ is a
        period that spans a year boundary (e.g. "Dec 20, 2025 through Jan
        18, 2026"), where a flat statement_year would misdate every row on
        one side of the boundary.
        """
        transactions: list[dict[str, Any]] = []
        for line in lines:
            match = _MULTI_COLUMN_BANK_LINE_PATTERN.match(line)
            if not match:
                continue
            date = OCRService._parse_date_token_with_year(match.group("date"), statement_year, statement_period)
            if not date:
                continue

            amount = OCRService._clean_amount(match.group("val1"))
            balance = OCRService._clean_amount(match.group("val2"))
            if amount is None or balance is None:
                continue
            description = match.group("desc").strip(" -\t")
            is_expense = OCRService._resolve_is_expense(line, match.group("sign"))

            transactions.append({
                "transactionDate": date,
                "description": description,
                "payeeOrPayer": description,
                "amount": -amount if is_expense else amount,
                "type": "EXPENSE" if is_expense else "INCOME",
                "balance": balance,
                "category": OCRService._vendor_category(line, is_expense) or "Uncategorized",
                "categoryConfidence": 0.0,
            })
        return transactions[:200]

    @staticmethod
    def _infer_statement_year(text: str) -> int:
        """Multi-column statement rows are often printed as MM/DD with no
        year (the year lives in the statement header/period instead) — this
        finds a plausible one to fill in, defaulting to the current year if
        none is printed anywhere in the document. Coarser than
        _infer_statement_period below (just "first 4-digit year anywhere"),
        so it's only the fallback when no full period header was found."""
        match = _YEAR_PATTERN.search(text)
        if match:
            return int(match.group(1))
        return datetime.now().year

    @staticmethod
    def _parse_period_date(raw: str) -> date | None:
        raw = raw.strip().rstrip(",")
        for fmt in _PERIOD_DATE_FORMATS:
            try:
                return datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def _infer_statement_period(text: str) -> "tuple[date, date] | None":
        """Finds a printed statement period like "August 16, 2023 through
        September 18, 2023" (Chase's own header, repeated on every page) —
        a much stronger signal than _infer_statement_year's single-year
        guess, since it also tells rows on either side of a year boundary
        (e.g. a period spanning Dec into Jan) which year they belong to.
        Returns None if no such header is found, in which case callers fall
        back to _infer_statement_year's flat single-year guess."""
        match = _STATEMENT_PERIOD_PATTERN.search(text)
        if not match:
            return None
        start = OCRService._parse_period_date(match.group(1))
        end = OCRService._parse_period_date(match.group(2))
        if start is None or end is None:
            return None
        return (start, end)

    @staticmethod
    def _resolve_year_for_month(month: int, statement_period: "tuple[date, date] | None", fallback_year: int) -> int:
        """Picks the right year for a yearless "MM/DD" row. Most statements
        don't cross a year boundary, so start.year == end.year and this is
        a no-op passthrough; the boundary-spanning case (e.g. period
        Dec 20, 2025 - Jan 18, 2026) is the one this exists for — a month
        matching the period's start month belongs to the start year, a
        month matching the end month belongs to the end year, and since a
        monthly statement's period is always short, any other month must
        fall on whichever side of Jan/Dec makes it the nearer one.
        """
        if statement_period is None:
            return fallback_year
        start, end = statement_period
        if start.year == end.year:
            return start.year
        if month == start.month:
            return start.year
        if month == end.month:
            return end.year
        return start.year if month > end.month else end.year

    @staticmethod
    def _parse_date_token_with_year(
        raw: str, fallback_year: int, statement_period: "tuple[date, date] | None" = None,
    ) -> str | None:
        """Parses a bank-statement date column: either a full "MM/DD/YYYY"
        row or a yearless "MM/DD" one (filling in fallback_year, or a year
        resolved from statement_period when given — see
        _resolve_year_for_month). Uses _BANK_STATEMENT_DATE_FORMATS rather
        than delegating to the generic _parse_date_token — that method
        tries day-first formats first, which would misread a full
        US-style "08/01/2026" row as 8 January instead of 1 August; this
        path needs month-first consistently for both the 2- and
        3-component cases.
        """
        for fmt in _BANK_STATEMENT_DATE_FORMATS:
            try:
                parsed = datetime.strptime(raw, fmt)
            except ValueError:
                continue
            if "%Y" not in fmt and "%y" not in fmt:
                year = OCRService._resolve_year_for_month(parsed.month, statement_period, fallback_year)
                parsed = parsed.replace(year=year)
            return parsed.date().isoformat()
        return None
