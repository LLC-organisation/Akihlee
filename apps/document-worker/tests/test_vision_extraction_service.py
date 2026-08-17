"""Unit tests for VisionExtractionService's parsing/sanitization — no
network calls; VisionExtractionService.extract() itself (the boto3 call)
isn't exercised here since that needs live/mocked AWS credentials."""

import json

from app.services.vision_extraction_service import (
    _CATEGORY_CONFIDENCE_THRESHOLD,
    _parse_result,
    _resolve_category,
)


class TestCategoryConfidenceThreshold:
    def test_threshold_is_065_not_080(self):
        # The whole point of the 0.65 change: a "reasonable but not
        # certain" 0.70 prediction must survive, where the old 0.80
        # threshold would have wiped it to Uncategorized.
        assert _CATEGORY_CONFIDENCE_THRESHOLD == 0.65

    def test_keeps_reasonable_confidence_predictions(self):
        assert _resolve_category("Meals & Entertainment", 0.70) == "Meals & Entertainment"
        assert _resolve_category("Software & IT Services", 0.65) == "Software & IT Services"

    def test_discards_genuinely_low_confidence_predictions(self):
        assert _resolve_category("Meals & Entertainment", 0.50) == "Uncategorized"
        assert _resolve_category("Meals & Entertainment", 0.64) == "Uncategorized"

    def test_rejects_categories_outside_the_fixed_taxonomy(self):
        assert _resolve_category("Not A Real Category", 0.99) == "Uncategorized"


class TestParseResultBankStatementSchema:
    def _bank_statement_payload(self, **overrides):
        payload = {
            "merchant": None,
            "date": "2026-08-31",
            "total_amount": None,
            "currency": "USD",
            "tax_amount": None,
            "document_type": "BANK_STATEMENT",
            "beginning_balance": 20734.40,
            "ending_balance": 22029.66,
            "line_items": [],
            "bank_transactions": [
                {
                    "transactionDate": "2026-08-01",
                    "description": "Deposit - Toast POS Daily Batch",
                    "payeeOrPayer": "Toast POS",
                    "amount": 3215.60,
                    "type": "INCOME",
                    "balance": 23950.00,
                    "category": "Uncategorized",
                    "categoryConfidence": 0.0,
                },
                {
                    "transactionDate": "2026-08-02",
                    "description": "ACH Debit - Sysco Foods",
                    "payeeOrPayer": "Sysco Foods",
                    "amount": -1920.34,
                    "type": "EXPENSE",
                    "balance": 22029.66,
                    "category": "Inventory & Raw Materials",
                    "categoryConfidence": 0.9,
                },
            ],
            "raw_text": "",
            "confidence": 0.95,
        }
        payload.update(overrides)
        return json.dumps(payload)

    def test_beginning_and_ending_balance_pass_through(self):
        result = _parse_result(self._bank_statement_payload())
        assert result["beginning_balance"] == 20734.40
        assert result["ending_balance"] == 22029.66

    def test_bank_transaction_balance_field_survives_sanitization(self):
        result = _parse_result(self._bank_statement_payload())
        assert result["bank_transactions"][0]["balance"] == 23950.00
        assert result["bank_transactions"][1]["balance"] == 22029.66

    def test_high_confidence_category_is_kept(self):
        result = _parse_result(self._bank_statement_payload())
        assert result["bank_transactions"][1]["category"] == "Inventory & Raw Materials"

    def test_low_confidence_category_is_discarded(self):
        payload = self._bank_statement_payload()
        data = json.loads(payload)
        data["bank_transactions"][1]["categoryConfidence"] = 0.5
        result = _parse_result(json.dumps(data))
        assert result["bank_transactions"][1]["category"] == "Uncategorized"

    def test_empty_raw_text_for_bank_statement_is_preserved(self):
        result = _parse_result(self._bank_statement_payload())
        assert result["raw_text"] == ""

    def test_receipt_has_null_balances(self):
        payload = {
            "merchant": "Coffee Shop", "date": "2026-08-01", "total_amount": 12.50,
            "currency": "USD", "tax_amount": 1.0, "document_type": "RECEIPT",
            "line_items": [], "bank_transactions": [], "raw_text": "receipt text",
            "confidence": 0.9,
        }
        result = _parse_result(json.dumps(payload))
        assert result["beginning_balance"] is None
        assert result["ending_balance"] is None


class TestParseResultMalformedInput:
    def test_invalid_json_returns_none(self):
        assert _parse_result("not json at all") is None

    def test_json_array_instead_of_object_returns_none(self):
        assert _parse_result("[1, 2, 3]") is None

    def test_strips_markdown_code_fences(self):
        wrapped = "```json\n" + json.dumps({
            "merchant": "Test", "date": None, "total_amount": None, "currency": "USD",
            "tax_amount": None, "document_type": "RECEIPT", "line_items": [],
            "bank_transactions": [], "raw_text": "", "confidence": 0.5,
        }) + "\n```"
        result = _parse_result(wrapped)
        assert result is not None
        assert result["merchant"] == "Test"
