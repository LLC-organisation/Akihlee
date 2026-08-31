"""Unit tests for OCRService's multi-column bank statement fallback parser."""

from app.services.ocr_service import OCRService


class TestMultiColumnBankTransactions:
    def test_parses_deposit_and_withdrawal_rows(self):
        lines = [
            "08/01 Deposit - Toast POS Daily Batch $3,215.60 $23,950.00",
            "08/02 ACH Debit - Sysco Foods $1,920.34 $22,029.66",
        ]

        transactions = OCRService._extract_bank_transactions_multi_column(lines, statement_year=2026)

        assert len(transactions) == 2

        deposit = transactions[0]
        assert deposit["transactionDate"] == "2026-08-01"
        assert deposit["description"] == "Deposit - Toast POS Daily Batch"
        assert deposit["amount"] == 3215.60
        assert deposit["type"] == "INCOME"
        assert deposit["balance"] == 23950.00

        withdrawal = transactions[1]
        assert withdrawal["transactionDate"] == "2026-08-02"
        assert withdrawal["description"] == "ACH Debit - Sysco Foods"
        assert withdrawal["amount"] == -1920.34  # signed negative for an expense
        assert withdrawal["type"] == "EXPENSE"
        assert withdrawal["balance"] == 22029.66

    def test_ignores_lines_that_dont_match_the_pattern(self):
        lines = ["Account Summary", "This is not a transaction row", ""]
        assert OCRService._extract_bank_transactions_multi_column(lines, statement_year=2026) == []

    def test_infers_expense_from_keyword_signals(self):
        lines = [
            "08/05 Payroll Run $5,000.00 $17,029.66",
            "08/06 Check #1042 $300.00 $16,729.66",
            "08/07 Monthly Fee $15.00 $16,714.66",
        ]
        transactions = OCRService._extract_bank_transactions_multi_column(lines, statement_year=2026)
        assert all(t["type"] == "EXPENSE" for t in transactions)
        assert all(t["amount"] < 0 for t in transactions)

    def test_respects_explicit_year_in_date(self):
        lines = ["08/01/2025 Deposit $100.00 $200.00"]
        transactions = OCRService._extract_bank_transactions_multi_column(lines, statement_year=2026)
        # The row's own year (2025) wins over the inferred statement_year fallback.
        assert transactions[0]["transactionDate"] == "2025-08-01"

    def test_recovers_row_wrapped_across_two_lines(self):
        # End-to-end: a row Tesseract split across two physical lines is
        # only parseable after _merge_wrapped_amount_lines stitches it back.
        lines = [
            "08/01 Deposit - Toast POS Daily Batch",
            "$3,215.60 $23,950.00",
        ]
        merged = OCRService._merge_wrapped_amount_lines(lines)
        transactions = OCRService._extract_bank_transactions_multi_column(merged, statement_year=2026)
        assert len(transactions) == 1
        assert transactions[0]["amount"] == 3215.60
        assert transactions[0]["balance"] == 23950.00

    def test_handles_misread_period_thousands_separator(self):
        lines = ["08/01 Large Deposit $18.944.96 $40.000.00"]
        transactions = OCRService._extract_bank_transactions_multi_column(lines, statement_year=2026)
        assert transactions[0]["amount"] == 18944.96
        assert transactions[0]["balance"] == 40000.00


class TestInferStatementYear:
    def test_finds_year_in_statement_header(self):
        text = "Statement Period: 08/01/2026 - 08/31/2026\nBeginning Balance $20,734.40"
        assert OCRService._infer_statement_year(text) == 2026

    def test_falls_back_to_current_year_when_absent(self):
        from datetime import datetime
        assert OCRService._infer_statement_year("no year anywhere here") == datetime.now().year


class TestParseDateTokenWithYear:
    def test_full_date_parses_directly(self):
        assert OCRService._parse_date_token_with_year("08/01/2026", 2099) == "2026-08-01"

    def test_month_day_only_uses_fallback_year(self):
        assert OCRService._parse_date_token_with_year("08/01", 2026) == "2026-08-01"

    def test_unparseable_returns_none(self):
        assert OCRService._parse_date_token_with_year("not a date", 2026) is None


class TestSingleColumnBankTransactionsBackwardCompatibility:
    def test_still_parses_signed_single_amount_lines(self):
        lines = ["12/03/2026 POS PURCHASE STORE 4 -1,250.00"]
        transactions = OCRService._extract_bank_transactions(lines)
        assert len(transactions) == 1
        assert transactions[0]["amount"] == -1250.00
        assert transactions[0]["type"] == "EXPENSE"
        assert transactions[0]["balance"] is None

    def test_keyword_signals_also_mark_expense_without_minus_sign(self):
        lines = ["12/03/2026 ACH Debit Vendor Payment 500.00"]
        transactions = OCRService._extract_bank_transactions(lines)
        assert transactions[0]["type"] == "EXPENSE"
        assert transactions[0]["amount"] == -500.00

    def test_payout_is_not_treated_as_an_expense(self):
        # A Square/Stripe payout landing in the account is a deposit, not a
        # withdrawal — this was previously misclassified as EXPENSE.
        lines = ["08/05/2026 Square Inc Payout 523.10"]
        transactions = OCRService._extract_bank_transactions(lines)
        assert transactions[0]["type"] == "INCOME"
        assert transactions[0]["amount"] == 523.10


class TestCleanAmount:
    def test_parses_plain_amount(self):
        assert OCRService._clean_amount("1,234.56") == 1234.56

    def test_fixes_misread_period_thousands_separator(self):
        # Tesseract occasionally emits a period instead of a comma.
        assert OCRService._clean_amount("18.944.96") == 18944.96

    def test_strips_leading_dollar_sign(self):
        assert OCRService._clean_amount("$42.00") == 42.0

    def test_no_decimal_suffix_returns_none(self):
        assert OCRService._clean_amount("not an amount") is None


class TestVendorCategory:
    def test_recognizes_income_vendor(self):
        assert OCRService._vendor_category("Toast POS Daily Batch", is_expense=False) == "Payment Processor Payout"
        assert OCRService._vendor_category("DoorDash Weekly Payout", is_expense=False) == "Delivery Platform Revenue"

    def test_recognizes_expense_vendor(self):
        assert OCRService._vendor_category("ACH Debit - Sysco Foods", is_expense=True) == "Inventory & Raw Materials"
        assert OCRService._vendor_category("Gusto Payroll", is_expense=True) == "Payroll & Personnel"

    def test_vendor_match_ignored_when_direction_disagrees(self):
        # A vendor name that's normally income shouldn't be applied to a row
        # already determined to be an expense (or vice versa) — the row's
        # own sign/keyword signal wins.
        assert OCRService._vendor_category("Toast POS Daily Batch", is_expense=True) is None
        assert OCRService._vendor_category("Gusto Payroll", is_expense=False) is None

    def test_no_match_returns_none(self):
        assert OCRService._vendor_category("Some Random Vendor", is_expense=True) is None

    def test_multi_column_row_gets_vendor_category(self):
        lines = ["08/01 Deposit - Toast POS Daily Batch $3,215.60 $23,950.00"]
        transactions = OCRService._extract_bank_transactions_multi_column(lines, statement_year=2026)
        assert transactions[0]["category"] == "Payment Processor Payout"

    def test_single_column_row_gets_vendor_category(self):
        lines = ["12/03/2026 ACH Debit Gusto Payroll -500.00"]
        transactions = OCRService._extract_bank_transactions(lines)
        assert transactions[0]["category"] == "Payroll & Personnel"


class TestExtractBankName:
    def test_skips_disclaimer_line_and_finds_bank_name(self):
        lines = ["[SAMPLE / TEST DOCUMENT]", "Chase Bank, N.A.", "Account Summary"]
        assert OCRService._extract_bank_name(lines) == "Chase Bank, N.A."

    def test_falls_back_to_first_line_when_no_bank_name_found(self):
        lines = ["Some Statement Title", "Account Summary"]
        assert OCRService._extract_bank_name(lines) == "Some Statement Title"

    def test_empty_lines_returns_none(self):
        assert OCRService._extract_bank_name([]) is None


class TestMergeWrappedAmountLines:
    def test_stitches_bare_amount_line_onto_previous(self):
        lines = [
            "08/01 Deposit - Toast POS Daily Batch",
            "$3,215.60 $23,950.00",
        ]
        merged = OCRService._merge_wrapped_amount_lines(lines)
        assert merged == ["08/01 Deposit - Toast POS Daily Batch $3,215.60 $23,950.00"]

    def test_leaves_unrelated_lines_untouched(self):
        lines = ["Account Summary", "08/01 Deposit $100.00 $200.00"]
        assert OCRService._merge_wrapped_amount_lines(lines) == lines
