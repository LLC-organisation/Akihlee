"""Deterministic post-processing shared by both extraction engines.

Neither VisionExtractionService (an LLM) nor OCRService (regex/Tesseract)
gets the final say on data quality. This module runs on the output of
*either* engine — see QueueConsumer._extract, the one call site — and:

1. Normalizes dates/currency-shaped numbers defensively, in case a model
   or a loosely-matched regex emitted something slightly off-schema.
2. For bank statements with both a beginning and ending balance, verifies
   the ledger arithmetic independently of whatever confidence the
   extraction engine itself reported. A statement that doesn't add up is
   flagged for manual review regardless of how confident the model was;
   one that reconciles exactly is stronger evidence of correctness than
   any self-reported confidence score, so it overrides it.

Deliberately standalone (imports nothing from ocr_service.py or
vision_extraction_service.py) so QueueConsumer can import all three
without any risk of a circular import.
"""

import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

# A calculated ending balance within 5 cents of the extracted one counts as
# reconciled — covers benign floating-point/rounding noise, not real
# discrepancies.
_RECONCILIATION_TOLERANCE = 0.05
# Confidence is capped (never raised) to this when the ledger math doesn't
# add up, which is safely below the default OCR_CONFIDENCE_THRESHOLD (0.7)
# — that's what actually routes the document to REVIEW_REQUIRED downstream
# in QueueConsumer.process_message, so no separate status field is needed.
_FAILED_RECONCILIATION_CONFIDENCE_CAP = 0.6

# Defensive re-normalization only — both engines should already emit
# YYYY-MM-DD by the time a value reaches here (VisionExtractionService's
# prompt asks for it directly; OCRService parses free text into it), so
# this is just a last line of defense against an off-schema value slipping
# through, not a general-purpose date parser.
_DATE_FORMATS = ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m/%d/%y", "%d/%m/%y"]


def _normalize_date(value: Any) -> Any:
    if not isinstance(value, str) or not value.strip():
        return value
    raw = value.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    logger.debug(f"Could not normalize date value, leaving as-is: {raw!r}")
    return raw


def _to_number(value: Any) -> float | None:
    """Coerces an int/float straight through, and strips $/, artifacts from
    a string a model occasionally emits instead of a bare JSON number."""
    if isinstance(value, bool):  # bool is an int subclass — never treat True/False as an amount
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace("$", "").replace(",", "").strip()
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _normalize_transaction(txn: Any) -> dict[str, Any] | None:
    if not isinstance(txn, dict):
        return None
    txn = dict(txn)
    txn["transactionDate"] = _normalize_date(txn.get("transactionDate"))
    txn["amount"] = _to_number(txn.get("amount"))
    txn["balance"] = _to_number(txn.get("balance"))

    # Defense-in-depth, same reasoning as the currency/category clamps in
    # vision_extraction_service.py: enforce the signed-amount convention
    # server-side rather than trusting the model/regex to have gotten the
    # sign right, since the reconciliation math below depends on it.
    txn_type = txn.get("type")
    if txn["amount"] is not None and txn_type in ("INCOME", "EXPENSE"):
        magnitude = abs(txn["amount"])
        txn["amount"] = magnitude if txn_type == "INCOME" else -magnitude

    return txn


def _reconcile_balances(
    beginning: float | None,
    ending: float | None,
    transactions: list[dict[str, Any]],
    current_confidence: Any,
) -> dict[str, Any]:
    """Returns {} (no change) when there isn't enough data to verify —
    missing balances or no transactions aren't treated as a failure, since
    there's nothing to actually check."""
    if beginning is None or ending is None or not transactions:
        return {}

    movement = sum(t["amount"] for t in transactions if isinstance(t.get("amount"), (int, float)))
    calculated_ending = beginning + movement
    diff = abs(calculated_ending - ending)

    if diff <= _RECONCILIATION_TOLERANCE:
        logger.info(
            f"Statement reconciled: beginning={beginning} + movement={movement:.2f} "
            f"== ending={ending} (diff={diff:.4f})"
        )
        return {"confidence": 1.0, "reconciliation_failed": False}

    logger.warning(
        f"Statement failed reconciliation: beginning={beginning} + movement={movement:.2f} "
        f"= {calculated_ending:.2f}, but extracted ending_balance={ending} "
        f"(diff={diff:.2f}) — flagging for manual review"
    )
    capped = (
        min(current_confidence, _FAILED_RECONCILIATION_CONFIDENCE_CAP)
        if isinstance(current_confidence, (int, float))
        else _FAILED_RECONCILIATION_CONFIDENCE_CAP
    )
    return {"confidence": capped, "reconciliation_failed": True}


def _validate_and_reconcile_statement(data: dict[str, Any]) -> dict[str, Any]:
    """Runs on the output of either extraction engine before it's returned
    to QueueConsumer. Always normalizes dates/numbers; only attempts ledger
    reconciliation for BANK_STATEMENT documents.
    """
    data = dict(data)
    data["date"] = _normalize_date(data.get("date"))
    data["total_amount"] = _to_number(data.get("total_amount"))
    data["tax_amount"] = _to_number(data.get("tax_amount"))

    if data.get("document_type") != "BANK_STATEMENT":
        return data

    data["beginning_balance"] = _to_number(data.get("beginning_balance"))
    data["ending_balance"] = _to_number(data.get("ending_balance"))

    normalized_transactions = [
        txn for txn in (_normalize_transaction(t) for t in (data.get("bank_transactions") or [])) if txn is not None
    ]
    data["bank_transactions"] = normalized_transactions

    data.update(_reconcile_balances(
        data["beginning_balance"], data["ending_balance"], normalized_transactions, data.get("confidence"),
    ))
    return data
