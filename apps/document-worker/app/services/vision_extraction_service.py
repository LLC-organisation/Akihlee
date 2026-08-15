"""Structured document extraction via an OpenRouter vision-capable LLM.

Primary extraction path when OPENROUTER_API_KEY is configured — QueueConsumer
falls back to OCRService's regex/Tesseract pipeline (unchanged) whenever this
returns None, so a free-tier model's rate limits, outages, or malformed JSON
degrade a document to REVIEW_REQUIRED rather than failing it outright.
"""

import base64
import json
import logging
import re
from pathlib import Path
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_JSON_FENCE_PATTERN = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)
_VALID_DOCUMENT_TYPES = {"RECEIPT", "INVOICE", "BANK_STATEMENT"}
_VALID_CURRENCIES = {"USD", "KES"}  # MVP scope: US and Kenyan markets only

# Field names deliberately match what OCRService.extract_receipt_fields
# already produces internally (merchant/date/total_amount/...) and what the
# core-api callback expects for nested objects (lineItems' unitPrice/
# totalPrice/categoryTag, bankTransactions' payeeOrPayer/type/category) — so
# QueueConsumer's _send_callback needs zero changes regardless of which
# extraction path produced the result.
_SYSTEM_PROMPT = """You are a financial document data extraction engine. You will be shown one or more \
images that are pages of a single receipt, invoice, or bank statement. Extract the data and respond with \
ONLY a JSON object (no markdown, no commentary, no code fences) matching exactly this shape:

{
  "merchant": string or null,
  "date": string or null (ISO 8601 date, YYYY-MM-DD, the transaction/document date),
  "total_amount": number or null,
  "currency": either "USD" or "KES" — this deployment only serves the US and Kenyan markets, so \
never return any other code. Infer it from currency symbols/text ("$" or "USD" -> "USD"; "KSh", \
"Ksh", "KES", or a trailing "/=" amount like "150/=" -> "KES"), the merchant's address/phone format, \
or language cues. If genuinely ambiguous, default to "KES",
  "tax_amount": number or null,
  "document_type": one of "RECEIPT", "INVOICE", "BANK_STATEMENT",
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
      "categoryTag": string or null (a short spending category, e.g. "Groceries", "Utilities", \
"Office Supplies", "Transport", "Dining", "Payroll", "Rent", "Other"),
      "isTaxable": boolean or null
    },
  "bank_transactions": array of objects (only for BANK_STATEMENT; empty array otherwise), each:
    {
      "transactionDate": string (ISO 8601 date),
      "description": string or null,
      "payeeOrPayer": string or null,
      "amount": number,
      "type": one of "INCOME", "EXPENSE", "TRANSFER",
      "category": string or null (a short spending category)
    },
  "raw_text": string (a best-effort plain-text transcription of everything visible on the page(s)),
  "confidence": number between 0 and 1 (your own confidence that the above is accurate and complete)
}

Rules:
- If a field cannot be determined, use null (or an empty array for list fields) rather than guessing.
- Every line item needs a numeric totalPrice and every bank transaction needs a numeric amount — omit \
an entry entirely rather than emit one without that field.
- Return valid JSON only. Do not wrap it in markdown code fences.
"""


class VisionExtractionService:
    """Calls an OpenRouter vision model with every page of a document in one request."""

    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=settings.VISION_EXTRACTION_TIMEOUT_SECONDS)

    async def aclose(self):
        await self.http_client.aclose()

    async def extract(self, image_paths: list[Path]) -> dict[str, Any] | None:
        """Returns a result dict in the same shape OCRService.extract_receipt_fields
        produces, or None if the call/response was unusable — callers should
        fall back to the regex pipeline in that case, not treat it as fatal.
        """
        pages = image_paths[: settings.MAX_PDF_PAGES]
        content: list[dict[str, Any]] = [
            {"type": "text", "text": "Extract the data from this document."}
        ]
        for path in pages:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{_encode_image(path)}"},
            })

        try:
            response = await self.http_client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
                json={
                    "model": settings.OPENROUTER_MODEL,
                    "messages": [
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": content},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.warning(f"OpenRouter request failed: {e}")
            return None

        body = response.json()
        try:
            raw_content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            logger.warning(f"Unexpected OpenRouter response shape: {body}")
            return None

        return _parse_result(raw_content)


def _encode_image(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def _parse_result(raw_content: str) -> dict[str, Any] | None:
    # Free-tier models don't always respect "no code fences" — strip them if present.
    cleaned = _JSON_FENCE_PATTERN.sub("", raw_content.strip()).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning(f"Vision model did not return valid JSON: {raw_content[:500]}")
        return None

    if not isinstance(data, dict):
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
        # prompt already asks for this, since a free-tier model won't always
        # follow instructions exactly.
        "currency": currency if currency in _VALID_CURRENCIES else "KES",
        "tax_amount": data.get("tax_amount"),
        "document_type": document_type if document_type in _VALID_DOCUMENT_TYPES else "RECEIPT",
        "line_items": line_items if isinstance(line_items, list) else [],
        "bank_transactions": bank_transactions if isinstance(bank_transactions, list) else [],
        "raw_text": data.get("raw_text") or "",
        "confidence": confidence if isinstance(confidence, (int, float)) and 0 <= confidence <= 1 else 0.5,
    }
