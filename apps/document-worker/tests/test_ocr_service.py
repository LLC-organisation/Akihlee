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

    def test_parses_signed_withdrawal_row(self):
        # A statement that prints the amount itself signed (e.g. Chase:
        # "-38.64" right next to the row's own running balance), rather
        # than an unsigned amount in a separate Deposit/Withdrawal column.
        # Previously the pattern had no sign group, so the "-" wasn't
        # whitespace and couldn't be absorbed by the description group
        # either — the row failed to match at all and was silently dropped.
        lines = ["08/16 Card Purchase 08/15 Merchant Name 000-0000000 MA Card 0707 -38.64 7,703.25"]
        transactions = OCRService._extract_bank_transactions_multi_column(lines, statement_year=2023)
        assert len(transactions) == 1
        assert transactions[0]["amount"] == -38.64
        assert transactions[0]["type"] == "EXPENSE"
        assert transactions[0]["balance"] == 7703.25

    def test_explicit_sign_overrides_keyword_direction(self):
        # A credit ("Card Purchase Return") contains the expense keyword
        # "purchase" but has no sign — the credit-override keyword
        # ("return") must win over the expense keyword, not the other way
        # around, since there's no minus sign to defer to here.
        lines = ["08/29 Card Purchase Return 08/28 Web Reg Merchant CA Card 0707 1,023.00 3,288.72"]
        transactions = OCRService._extract_bank_transactions_multi_column(lines, statement_year=2023)
        assert transactions[0]["type"] == "INCOME"
        assert transactions[0]["amount"] == 1023.00

    def test_zelle_payment_direction_from_sign_and_keyword(self):
        # "Payment To" (signed negative on this statement) is an expense;
        # "Payment From" (no sign, no expense keyword) is income. Neither
        # contains any of the original expense keywords, so before the
        # sign group existed "Payment To" fell through to the INCOME
        # default despite its printed minus sign.
        lines = [
            "09/08 Zelle Payment To Jane Doe Abc123Xyz -44.00 5,204.72",
            "08/18 Zelle Payment From John Smith 18203312849 240.00 7,795.12",
        ]
        transactions = OCRService._extract_bank_transactions_multi_column(lines, statement_year=2023)
        assert transactions[0]["type"] == "EXPENSE"
        assert transactions[0]["amount"] == -44.00
        assert transactions[1]["type"] == "INCOME"
        assert transactions[1]["amount"] == 240.00

    def test_recovers_row_wrapped_across_three_lines(self):
        # A real 3-line wrap: description line, then an orphan line
        # carrying just the card's last-4-digits suffix ("0707"), then the
        # signed amount + balance line. The old two-line-only merge left
        # "0707" as its own unmergeable orphan, so neither resulting line
        # matched a transaction pattern and the row was dropped entirely.
        lines = [
            "08/17 Card Purchase With Pin 08/16 Merchant #249 2485 Notr City CA Card",
            "0707",
            "-61.53 7,572.22",
        ]
        merged = OCRService._merge_wrapped_amount_lines(lines)
        transactions = OCRService._extract_bank_transactions_multi_column(merged, statement_year=2023)
        assert len(transactions) == 1
        assert transactions[0]["amount"] == -61.53
        assert transactions[0]["balance"] == 7572.22
        assert transactions[0]["type"] == "EXPENSE"


class TestInferStatementYear:
    def test_finds_year_in_statement_header(self):
        text = "Statement Period: 08/01/2026 - 08/31/2026\nBeginning Balance $20,734.40"
        assert OCRService._infer_statement_year(text) == 2026

    def test_falls_back_to_current_year_when_absent(self):
        from datetime import datetime
        assert OCRService._infer_statement_year("no year anywhere here") == datetime.now().year


class TestInferStatementPeriod:
    def test_parses_chase_style_period_header(self):
        # Chase's own header format, repeated on every page of the real
        # statement this was modeled on.
        text = "August 16, 2023 through September 18, 2023\nAccount Number: XXXXXX0707"
        period = OCRService._infer_statement_period(text)
        assert period is not None
        start, end = period
        assert start.isoformat() == "2023-08-16"
        assert end.isoformat() == "2023-09-18"

    def test_returns_none_when_no_period_header_present(self):
        assert OCRService._infer_statement_period("no period text here") is None


class TestResolveYearForMonth:
    def test_no_period_uses_fallback_year(self):
        assert OCRService._resolve_year_for_month(8, None, 2026) == 2026

    def test_period_within_single_year(self):
        from datetime import date
        period = (date(2023, 8, 16), date(2023, 9, 18))
        assert OCRService._resolve_year_for_month(8, period, 2099) == 2023
        assert OCRService._resolve_year_for_month(9, period, 2099) == 2023

    def test_period_spanning_year_boundary(self):
        # A period like "December 20, 2025 through January 18, 2026" — a
        # flat single-year guess would misdate every row on one side of
        # the boundary; the resolved year must track the row's own month.
        from datetime import date
        period = (date(2025, 12, 20), date(2026, 1, 18))
        assert OCRService._resolve_year_for_month(12, period, 2099) == 2025
        assert OCRService._resolve_year_for_month(1, period, 2099) == 2026


class TestParseDateTokenWithYear:
    def test_full_date_parses_directly(self):
        assert OCRService._parse_date_token_with_year("08/01/2026", 2099) == "2026-08-01"

    def test_month_day_only_uses_fallback_year(self):
        assert OCRService._parse_date_token_with_year("08/01", 2026) == "2026-08-01"

    def test_unparseable_returns_none(self):
        assert OCRService._parse_date_token_with_year("not a date", 2026) is None

    def test_month_day_resolves_against_year_spanning_period(self):
        from datetime import date
        period = (date(2025, 12, 20), date(2026, 1, 18))
        # Fallback year (2099) would be wrong for both — the period must win.
        assert OCRService._parse_date_token_with_year("12/22", 2099, period) == "2025-12-22"
        assert OCRService._parse_date_token_with_year("01/05", 2099, period) == "2026-01-05"


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

    def test_stitches_orphan_middle_line_across_three_lines(self):
        # A card-suffix line ("0707") sitting between the description and
        # the amount — not bare-amount-shaped itself, so it must still get
        # absorbed rather than left as an unmergeable orphan.
        lines = [
            "08/17 Card Purchase With Pin 08/16 Merchant #249 2485 Notr City CA Card",
            "0707",
            "-61.53 7,572.22",
        ]
        merged = OCRService._merge_wrapped_amount_lines(lines)
        assert merged == [
            "08/17 Card Purchase With Pin 08/16 Merchant #249 2485 Notr City CA Card 0707 -61.53 7,572.22"
        ]

    def test_does_not_glue_unrelated_text_onto_an_already_closed_row(self):
        # Once a row already ends in a trailing amount, it's considered
        # complete — a following non-date-leading line (e.g. a page
        # footer or a repeated table header) must start a new entry
        # rather than getting appended onto the finished transaction,
        # which would otherwise break that row's own trailing-amount match.
        lines = [
            "08/01 Deposit - Toast POS Daily Batch $3,215.60 $23,950.00",
            "Page 1 of 4",
        ]
        assert OCRService._merge_wrapped_amount_lines(lines) == lines
