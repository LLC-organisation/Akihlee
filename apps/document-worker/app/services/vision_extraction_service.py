"""Structured document extraction via Claude Sonnet 4.5 on AWS Bedrock.

Primary extraction path when AWS_ACCESS_KEY_ID is configured — DocumentProcessor
falls back to OCRService's regex/Tesseract pipeline (unchanged) whenever this
returns None, so an outage or unparseable response degrades a document to
REVIEW_REQUIRED rather than failing it outright.
"""

import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any

from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
import boto3

from app.config import settings

logger = logging.getLogger(__name__)

# Bedrock's Converse API validates the declared image format against the
# actual bytes — PDFs are always rasterized to PNG pages by DocumentProcessor,
# but a directly-uploaded image keeps its original suffix, so this has to
# reflect the real file type rather than assuming PNG for everything.
_BEDROCK_IMAGE_FORMAT_BY_SUFFIX = {
    ".png": "png",
    ".jpg": "jpeg",
    ".jpeg": "jpeg",
    ".gif": "gif",
    ".webp": "webp",
}

_JSON_FENCE_PATTERN = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)
_VALID_DOCUMENT_TYPES = {"RECEIPT", "INVOICE", "BANK_STATEMENT"}
_VALID_CURRENCIES = {"USD", "KES"}  # MVP scope: US and Kenyan markets only

# Fixed SME spending taxonomy — must match SPENDING_CATEGORIES in
# apps/web/src/lib/utils/categories.ts. The model is never trusted to invent
# a category outside this list. Only applies to line items (always spend)
# and EXPENSE-type bank transactions — see _VALID_INCOME_CATEGORIES below
# for INCOME-type rows, which this taxonomy was never a fit for.
_VALID_CATEGORIES = {
    "Meals & Entertainment",
    "Office Supplies & Equipment",
    "Software & IT Services",
    "Utilities & Rent",
    "Travel & Transportation",
    "Inventory & Raw Materials",
    "Marketing & Advertising",
    "Professional Services",
    "Payroll & Personnel",
    "Uncategorized",
}
# Fixed income taxonomy for INCOME-type bank transactions — must match
# INCOME_CATEGORIES in apps/web/src/lib/utils/categories.ts. Deliberately
# separate from _VALID_CATEGORIES above: every deposit was defaulting to
# "Uncategorized" there since nothing in an expense-shaped list ever fit.
_VALID_INCOME_CATEGORIES = {
    "Sales Revenue",
    "Payment Processor Payout",
    "Delivery Platform Revenue",
    "Client Invoices & Services",
    "Loans & Financing",
    "Owner Contribution",
    "Interest Income",
    "Refunds & Reimbursements",
    "Other Income",
    "Uncategorized",
}
# Below this, a category the model proposed is discarded in favor of
# "Uncategorized" — a person should confirm low-confidence categorizations
# rather than have them silently reported as real spending breakdowns.
# 0.65 rather than a stricter 0.80: at 0.80, Sonnet 4.5's reasonable-but-not-
# certain predictions (e.g. a slightly ambiguous line item) were getting
# wiped out as often as genuinely bad guesses, which pushed too much
# categorization work back onto manual review for a model this capable.
_CATEGORY_CONFIDENCE_THRESHOLD = 0.65

# Field names deliberately match what OCRService.extract_receipt_fields
# already produces internally (merchant/date/total_amount/...) and what the
# core-api callback expects for nested objects (lineItems' unitPrice/
# totalPrice/categoryTag, bankTransactions' payeeOrPayer/type/category) — so
# DocumentProcessor's _send_callback needs zero changes regardless of which
# extraction path produced the result. beginning_balance/ending_balance and
# bank_transactions[].balance are the exception — those are new, and are
# consumed by reconciliation.py rather than the core-api callback.
_SYSTEM_PROMPT = """You are a financial document data extraction engine. You will be shown one or more \
images that are pages of a single receipt, invoice, or bank statement. Extract the data and respond with \
ONLY a JSON object (no markdown, no commentary, no code fences) matching exactly this shape:

{
  "merchant": string or null — for BANK_STATEMENT, this is the financial institution's official \
name (e.g. "JPMorgan Chase Bank, N.A.") or the account holder's name; NEVER sample/disclaimer \
boilerplate like "[SAMPLE / TEST DOCUMENT]" or a generic document title, even if that's the most \
prominent text on the page,
  "date": string or null (ISO 8601 date, YYYY-MM-DD) — the transaction/document date; for \
BANK_STATEMENT this is the statement period's end date. If a printed date is ambiguous with no \
clear day/month labels (e.g. "08/01"), assume US month-first convention (08/01 -> August 1) unless \
other content on the page clearly indicates a different convention,
  "total_amount": number or null — for BANK_STATEMENT, this must equal ending_balance below,
  "currency": either "USD" or "KES" — this deployment only serves the US and Kenyan markets, so \
never return any other code. Infer it from currency symbols/text ("$" or "USD" -> "USD"; "KSh", \
"Ksh", "KES", or a trailing "/=" amount like "150/=" -> "KES"), the merchant's address/phone format, \
or language cues. If genuinely ambiguous, default to "KES",
  "tax_amount": number or null,
  "document_type": one of "RECEIPT", "INVOICE", "BANK_STATEMENT",
  "beginning_balance": number or null (BANK_STATEMENT only — the account's opening/beginning \
balance for the statement period; always null for RECEIPT/INVOICE),
  "ending_balance": number or null (BANK_STATEMENT only — the account's closing/ending balance \
for the statement period; always null for RECEIPT/INVOICE),
  "line_items": array of objects (only for RECEIPT/INVOICE; empty array for BANK_STATEMENT), each:
    {
      "itemName": string or null (a short product/service name, e.g. "Consulting Services" or \
"Widget A" — only for INVOICE documents; leave null for RECEIPT line items or if no distinct name is \
visible separate from the description),
      "description": string,
      "sku": string or null,
      "quantity": number or null,
      "unitPrice": number or null,
      "totalPrice": number,
      "categoryTag": one of "Meals & Entertainment", "Office Supplies & Equipment", \
"Software & IT Services", "Utilities & Rent", "Travel & Transportation", "Inventory & Raw Materials", \
"Marketing & Advertising", "Professional Services", "Payroll & Personnel", "Uncategorized" — pick the \
single best-fitting category strictly from this list; never invent one outside it, and use \
"Uncategorized" if genuinely unsure,
      "categoryConfidence": number between 0 and 1 (your confidence in categoryTag above),
      "isTaxable": boolean or null
    },
  "bank_transactions": array of objects (only for BANK_STATEMENT; empty array otherwise) — a \
statement is often laid out as a table with separate Deposit/Withdrawal columns plus a running \
Balance column; read across each row rather than each column in isolation, and represent every \
row as one object here regardless of which column its figure was under. Include every transaction \
row from every page provided — do not summarize, truncate, or skip rows on a long statement. Do \
NOT emit an entry for a "Beginning Balance" / "Ending Balance" row inside the transaction table \
itself, or for an account-summary box's subtotal lines (e.g. "Deposits and Additions", "ATM & \
Debit Card Withdrawals", "Electronic Withdrawals", "Other Withdrawals") — those are anchors/\
aggregates of the real rows below them, already captured by beginning_balance/ending_balance \
above, not transactions in their own right. A row's description may wrap onto a second or third \
printed line before its amount appears (e.g. a long merchant name pushing the amount down a \
line) — still treat it as one transaction, not multiple:
    {
      "transactionDate": string (ISO 8601 date, YYYY-MM-DD — infer the year from the statement's \
header/period if a row only prints month/day). Some statements print two dates per row — a \
leading posting date for the row itself, plus a second (usually earlier) transaction/purchase \
date embedded in the description, e.g. "08/16 Card Purchase 08/15 Merchant Name ...". Use the \
row's own leading date here; leave the second date as part of description rather than discarding \
it,
      "description": string or null,
      "payeeOrPayer": string or null — for a person-to-person transfer (e.g. "Zelle Payment From \
Jane Doe" or "Zelle Payment To John Smith"), this is the counterparty's name (Jane Doe / John \
Smith), not "Zelle",
      "amount": number — the signed transaction amount: positive for a deposit/credit/income row, \
negative for a withdrawal/debit/expense row (e.g. -1920.34 for a $1,920.34 withdrawal). Never emit \
an unsigned magnitude here even if the statement's own column is unsigned (e.g. separate Deposit/\
Withdrawal columns) — you supply the sign based on which column/type the row belongs to. Trust the \
actual printed sign/column over a surface-level word match in the description — e.g. a "Card \
Purchase Return" or "Purchase Refund" row is a credit (positive) despite containing the word \
"Purchase", and "Zelle Payment To X" is a debit (negative) despite containing "Payment" the same \
way "Zelle Payment From X" does for a credit,
      "type": one of "INCOME", "EXPENSE", "TRANSFER" — must agree with the sign of amount above,
      "balance": number or null — the running account balance printed on this row, if the \
statement shows one (most do, as a third column after the transaction amount); null if this \
statement doesn't print a running balance,
      "category": the taxonomy depends on type above — an expense-shaped category never fits a \
deposit, so use the matching list:
        - type "EXPENSE": one of "Meals & Entertainment", "Office Supplies & Equipment", \
"Software & IT Services", "Utilities & Rent", "Travel & Transportation", "Inventory & Raw Materials", \
"Marketing & Advertising", "Professional Services", "Payroll & Personnel", "Uncategorized",
        - type "INCOME": one of "Sales Revenue" (regular product/service sales not otherwise covered \
below), "Payment Processor Payout" (a Square/Stripe/PayPal/etc. payout landing in the account), \
"Delivery Platform Revenue" (a DoorDash/UberEats/Grubhub/Postmates-style marketplace payout), \
"Client Invoices & Services" (a B2B client paying an invoice — consulting, catering, contract work), \
"Loans & Financing", "Owner Contribution", "Interest Income", "Refunds & Reimbursements", \
"Other Income", "Uncategorized",
        - type "TRANSFER": always "Uncategorized" — a transfer between the business's own accounts \
is neither income nor spend, so don't attempt to categorize it,
      pick the single best-fitting category strictly from the list matching this row's type; never \
invent one outside it, and use "Uncategorized" if genuinely unsure,
      "categoryConfidence": number between 0 and 1 (your confidence in category above)
    },
  "raw_text": string — a best-effort plain-text transcription of everything visible on the \
page(s). EXCEPTION: if document_type is "BANK_STATEMENT", set this to an empty string "" instead \
of transcribing — every row is already captured structurally in bank_transactions above, so a \
full transcription just burns output tokens without adding information, and risks truncating the \
transaction list on a long statement,
  "confidence": number between 0 and 1 (your own confidence that the above is accurate and complete)
}

Known vendor/payee name patterns — treat these as strong priors for categoryTag/category (and for a \
bank transaction's type) whenever the payee or description clearly matches one, since a recognized \
vendor name is more reliable than judging from amount/context alone. Still use your own judgment if \
the actual page content clearly contradicts one (e.g. a refund from a normally-expense vendor):
- "Toast", "Square", "Clover" (a POS payout landing in the account) -> type INCOME, category \
"Payment Processor Payout"
- "DoorDash", "UberEats", "Uber Eats", "Grubhub", "Postmates" -> type INCOME, category \
"Delivery Platform Revenue"
- "Sysco", "US Foods", "Restaurant Depot" -> type EXPENSE, category "Inventory & Raw Materials"
- "Gusto", "ADP", "Paychex" -> type EXPENSE, category "Payroll & Personnel"
- A utility or realty company (electric, gas, water, internet, rent) -> type EXPENSE, category \
"Utilities & Rent"

Rules:
- If a field cannot be determined, use null (or an empty array for list fields) rather than guessing.
- Every line item needs a numeric totalPrice and every bank transaction needs a numeric amount — omit \
an entry entirely rather than emit one without that field.
- If your confidence in a categoryTag/category value is below 0.65, set it to "Uncategorized" and set \
categoryConfidence accordingly, rather than guessing at a specific category. Above 0.65, keep your best \
specific guess even if you're not fully certain — do not default to "Uncategorized" out of caution alone.
- Return valid JSON only. Do not wrap it in markdown code fences.
"""


class VisionExtractionService:
    """Calls Claude Sonnet 4.5 on Bedrock with every page of a document in one request."""

    def __init__(self):
        self._client = boto3.client(
            "bedrock-runtime",
            region_name=settings.AWS_REGION,
            config=Config(
                retries={"max_attempts": 5, "mode": "adaptive"},
                connect_timeout=settings.VISION_EXTRACTION_TIMEOUT_SECONDS,
                read_timeout=settings.VISION_EXTRACTION_TIMEOUT_SECONDS,
            ),
        )

    async def aclose(self):
        pass  # boto3 client has no async resources to release

    async def extract(self, image_paths: list[Path]) -> dict[str, Any] | None:
        """Returns a result dict in the same shape OCRService.extract_receipt_fields
        produces, or None if the call/response was unusable — callers should
        fall back to the regex pipeline in that case, not treat it as fatal.
        """
        pages = image_paths[: settings.MAX_PDF_PAGES]
        content: list[dict[str, Any]] = [
            {"text": "Extract the data from this document."}
        ]
        for path in pages:
            image_format = _BEDROCK_IMAGE_FORMAT_BY_SUFFIX.get(path.suffix.lower(), "png")
            content.append({
                "image": {
                    "format": image_format,
                    "source": {"bytes": path.read_bytes()},
                },
            })

        try:
            # boto3 is synchronous — run it off the event loop so a slow
            # extraction doesn't block the ASGI event loop from serving
            # other requests (health checks, etc.) while this one is in
            # flight.
            response = await asyncio.to_thread(
                self._client.converse,
                modelId=settings.BEDROCK_MODEL_ID,
                system=[{"text": _SYSTEM_PROMPT}],
                messages=[{"role": "user", "content": content}],
                # 16K, not 8192: a dense multi-page bank statement can run
                # well over 100 transaction rows, each needing its own
                # balance/category fields now — raw_text is no longer
                # requested for BANK_STATEMENT (see the prompt), which
                # buys back most of this, but the budget still needs
                # headroom to avoid truncating the transaction list on a
                # long statement.
                inferenceConfig={"maxTokens": 16384, "temperature": 0},
            )
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"Bedrock request failed: {e}")
            return None
        except Exception as e:
            # Catches Bedrock timeouts and any other unexpected failure
            # (e.g. a read timeout that botocore doesn't wrap as a
            # ClientError) — still a "fall back to OCR" case, not fatal.
            logger.error(f"Unexpected error calling Bedrock: {e}")
            return None

        try:
            raw_content = "".join(
                block["text"]
                for block in response["output"]["message"]["content"]
                if "text" in block
            )
        except (KeyError, IndexError, TypeError):
            logger.warning(f"Unexpected Bedrock response shape: {response}")
            return None

        return _parse_result(raw_content)


def _resolve_category(raw_category: Any, raw_confidence: Any, valid_categories: set[str] = _VALID_CATEGORIES) -> str:
    """Never trust the model's own confidence-threshold judgment — enforce
    it here even though the prompt also asks for it, same reasoning as the
    currency/document_type clamping below (a model won't always follow
    instructions exactly). valid_categories defaults to the spending
    taxonomy (line items, EXPENSE bank transactions); callers pass
    _VALID_INCOME_CATEGORIES for INCOME-type bank transactions instead.
    """
    confidence = raw_confidence if isinstance(raw_confidence, (int, float)) else 0.0
    if confidence < _CATEGORY_CONFIDENCE_THRESHOLD:
        return "Uncategorized"
    return raw_category if raw_category in valid_categories else "Uncategorized"


def _normalize_confidence(raw_confidence: Any) -> float | None:
    """Clamps to a real [0, 1] float, or None for anything else — this is
    what actually gets persisted (see BankTransaction.categoryConfidence/
    LineItem.categoryConfidence), so a model emitting a string or an
    out-of-range number shouldn't silently corrupt a confidence-badge UI.
    """
    if isinstance(raw_confidence, (int, float)) and 0 <= raw_confidence <= 1:
        return float(raw_confidence)
    return None


def _sanitize_line_items(line_items: list[Any]) -> list[dict[str, Any]]:
    sanitized = []
    for item in line_items:
        if not isinstance(item, dict):
            continue
        item = dict(item)
        raw_confidence = item.get("categoryConfidence")
        item["categoryTag"] = _resolve_category(item.get("categoryTag"), raw_confidence)
        # Kept (not discarded) even when categoryTag got clamped to
        # "Uncategorized" above — a low-but-present confidence value is
        # exactly what should drive an amber "needs review" badge, not a
        # value indistinguishable from "never scored."
        item["categoryConfidence"] = _normalize_confidence(raw_confidence)
        sanitized.append(item)
    return sanitized


def _sanitize_bank_transactions(transactions: list[Any]) -> list[dict[str, Any]]:
    sanitized = []
    for txn in transactions:
        if not isinstance(txn, dict):
            continue
        txn = dict(txn)
        raw_confidence = txn.get("categoryConfidence")
        # A transfer between the business's own accounts is neither income
        # nor spend — never worth attempting to categorize, regardless of
        # what the model proposed. categoryConfidence is None here (not 0)
        # since no categorization was ever attempted, as opposed to one
        # that was attempted and scored low.
        if txn.get("type") == "TRANSFER":
            txn["category"] = "Uncategorized"
            txn["categoryConfidence"] = None
        elif txn.get("type") == "INCOME":
            txn["category"] = _resolve_category(txn.get("category"), raw_confidence, _VALID_INCOME_CATEGORIES)
            txn["categoryConfidence"] = _normalize_confidence(raw_confidence)
        else:
            txn["category"] = _resolve_category(txn.get("category"), raw_confidence)
            txn["categoryConfidence"] = _normalize_confidence(raw_confidence)
        sanitized.append(txn)
    return sanitized


def _parse_result(raw_content: str) -> dict[str, Any] | None:
    # Even a strong model doesn't always respect "no code fences" — strip them if present.
    cleaned = _JSON_FENCE_PATTERN.sub("", raw_content.strip()).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.warning(f"Vision model did not return valid JSON ({e}): {raw_content[:500]!r}")
        return None

    if not isinstance(data, dict):
        logger.warning(f"Vision model returned valid JSON but not an object: {type(data).__name__}")
        return None

    document_type = data.get("document_type")
    line_items = data.get("line_items")
    bank_transactions = data.get("bank_transactions")
    confidence = data.get("confidence")
    currency = data.get("currency")

    return {
        "merchant": data.get("merchant"),
        "date": data.get("date"),
        "total_amount": data.get("total_amount"),
        # MVP only serves the US and Kenyan markets — clamp even though the
        # prompt already asks for this, since a model won't always follow
        # instructions exactly.
        "currency": currency if currency in _VALID_CURRENCIES else "KES",
        "tax_amount": data.get("tax_amount"),
        "document_type": document_type if document_type in _VALID_DOCUMENT_TYPES else "RECEIPT",
        # Only meaningful for BANK_STATEMENT — reconciliation.py treats a
        # missing/non-BANK_STATEMENT value as "nothing to verify" rather
        # than a failure, so no clamping needed here beyond passing it through.
        "beginning_balance": data.get("beginning_balance"),
        "ending_balance": data.get("ending_balance"),
        "line_items": _sanitize_line_items(line_items) if isinstance(line_items, list) else [],
        "bank_transactions": _sanitize_bank_transactions(bank_transactions) if isinstance(bank_transactions, list) else [],
        "raw_text": data.get("raw_text") or "",
        "confidence": confidence if isinstance(confidence, (int, float)) and 0 <= confidence <= 1 else 0.5,
    }
