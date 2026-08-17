"""Unit tests for the shared post-processing/reconciliation engine."""

from app.services.reconciliation import (
    _normalize_date,
    _normalize_transaction,
    _reconcile_balances,
    _to_number,
    _validate_and_reconcile_statement,
)


class TestToNumber:
    def test_passes_through_int_and_float(self):
        assert _to_number(42) == 42.0
        assert _to_number(19.99) == 19.99

    def test_strips_currency_artifacts_from_strings(self):
        assert _to_number("$1,234.56") == 1234.56
        assert _to_number("1,920.34") == 1920.34
        assert _to_number("  $42.00 ") == 42.0

    def test_rejects_unparseable_and_bool(self):
        assert _to_number("not a number") is None
        assert _to_number(None) is None
        assert _to_number(True) is None
        assert _to_number(False) is None

    def test_empty_string_is_none(self):
        assert _to_number("") is None
        assert _to_number("   ") is None


class TestNormalizeDate:
    def test_already_iso_passes_through(self):
        assert _normalize_date("2026-08-01") == "2026-08-01"

    def test_normalizes_slash_formats(self):
        assert _normalize_date("08/01/2026") == "2026-08-01"
        assert _normalize_date("01/08/2026") == "2026-01-08"

    def test_leaves_unparseable_value_unchanged(self):
        assert _normalize_date("not a date") == "not a date"

    def test_non_string_passes_through(self):
        assert _normalize_date(None) is None


class TestNormalizeTransaction:
    def test_enforces_negative_sign_for_expense(self):
        txn = _normalize_transaction({"amount": 1920.34, "type": "EXPENSE", "transactionDate": "2026-08-02"})
        assert txn["amount"] == -1920.34

    def test_enforces_positive_sign_for_income(self):
        txn = _normalize_transaction({"amount": -3215.60, "type": "INCOME", "transactionDate": "2026-08-01"})
        assert txn["amount"] == 3215.60

    def test_coerces_currency_string_amount(self):
        txn = _normalize_transaction({"amount": "$1,920.34", "type": "EXPENSE"})
        assert txn["amount"] == -1920.34

    def test_normalizes_balance_and_date(self):
        txn = _normalize_transaction({
            "amount": 100, "type": "INCOME", "balance": "$23,950.00", "transactionDate": "08/01/2026",
        })
        assert txn["balance"] == 23950.00
        assert txn["transactionDate"] == "2026-08-01"

    def test_non_dict_returns_none(self):
        assert _normalize_transaction("not a dict") is None


class TestReconcileBalances:
    def test_reconciles_and_boosts_confidence_to_1(self):
        transactions = [
            {"amount": 3215.60, "type": "INCOME"},
            {"amount": -1920.34, "type": "EXPENSE"},
        ]
        result = _reconcile_balances(20734.40, 22029.66, transactions, current_confidence=0.5)
        assert result == {"confidence": 1.0, "reconciliation_failed": False}

    def test_tolerates_half_cent_rounding_noise(self):
        transactions = [{"amount": 100.00, "type": "INCOME"}]
        result = _reconcile_balances(1000.00, 1100.03, transactions, current_confidence=0.9)
        assert result["reconciliation_failed"] is False
        assert result["confidence"] == 1.0

    def test_flags_and_caps_confidence_on_mismatch(self):
        transactions = [{"amount": 3215.60, "type": "INCOME"}]
        result = _reconcile_balances(20734.40, 99999.99, transactions, current_confidence=0.95)
        assert result["reconciliation_failed"] is True
        assert result["confidence"] == 0.6

    def test_never_raises_confidence_on_mismatch_even_if_already_low(self):
        transactions = [{"amount": 3215.60, "type": "INCOME"}]
        result = _reconcile_balances(20734.40, 99999.99, transactions, current_confidence=0.2)
        assert result["confidence"] == 0.2  # min(0.2, 0.6) — capped, never raised

    def test_skips_when_balances_missing(self):
        assert _reconcile_balances(None, 100.0, [{"amount": 1, "type": "INCOME"}], 0.5) == {}
        assert _reconcile_balances(100.0, None, [{"amount": 1, "type": "INCOME"}], 0.5) == {}

    def test_skips_when_no_transactions(self):
        assert _reconcile_balances(100.0, 100.0, [], 0.5) == {}


class TestValidateAndReconcileStatement:
    def test_full_bank_statement_reconciles(self):
        data = {
            "document_type": "BANK_STATEMENT",
            "date": "08/31/2026",
            "total_amount": None,
            "tax_amount": None,
            "beginning_balance": "$20,734.40",
            "ending_balance": 22029.66,
            "confidence": 0.5,
            "bank_transactions": [
                {
                    "transactionDate": "08/01/2026", "description": "Deposit - Toast POS Daily Batch",
                    "payeeOrPayer": "Toast POS", "amount": 3215.60, "type": "INCOME",
                    "balance": "$23,950.00", "category": "Uncategorized",
                },
                {
                    "transactionDate": "08/02/2026", "description": "ACH Debit - Sysco Foods",
                    "payeeOrPayer": "Sysco Foods", "amount": 1920.34, "type": "EXPENSE",  # unsigned, as the OCR fallback might emit before correction
                    "balance": "22,029.66", "category": "Uncategorized",
                },
            ],
        }

        result = _validate_and_reconcile_statement(data)

        assert result["date"] == "2026-08-31"
        assert result["confidence"] == 1.0
        assert result["reconciliation_failed"] is False
        assert result["beginning_balance"] == 20734.40
        assert result["bank_transactions"][1]["amount"] == -1920.34  # sign corrected
        assert result["bank_transactions"][0]["balance"] == 23950.00

    def test_non_bank_statement_only_normalizes_top_level_fields(self):
        data = {
            "document_type": "RECEIPT",
            "date": "08/01/2026",
            "total_amount": "$42.00",
            "tax_amount": "$3.50",
            "confidence": 0.9,
        }
        result = _validate_and_reconcile_statement(data)
        assert result["date"] == "2026-08-01"
        assert result["total_amount"] == 42.0
        assert result["tax_amount"] == 3.5
        assert "beginning_balance" not in result
        assert "reconciliation_failed" not in result

    def test_failed_reconciliation_forces_review(self):
        # Simulates a bad extraction: transactions don't add up to the
        # printed ending balance at all.
        data = {
            "document_type": "BANK_STATEMENT",
            "beginning_balance": 1000.0,
            "ending_balance": 5000.0,
            "confidence": 0.95,
            "bank_transactions": [{"amount": 10.0, "type": "INCOME", "transactionDate": "2026-08-01"}],
        }
        result = _validate_and_reconcile_statement(data)
        assert result["reconciliation_failed"] is True
        # Below the default OCR_CONFIDENCE_THRESHOLD (0.7) so QueueConsumer
        # routes this to REVIEW_REQUIRED regardless of the model's own
        # self-reported confidence.
        assert result["confidence"] < 0.7
