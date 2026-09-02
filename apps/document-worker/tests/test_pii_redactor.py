"""Unit tests for pii_redactor. Exercises the real PyMuPDF + Presidio/spaCy
pipeline (no mocking) since the whole point of this module is that raw PII
text is actually gone from the output PDF's text layer — a mocked analyzer
would test nothing meaningful here.
"""

import pymupdf as fitz
import pytest

from app.services.pii_redactor import _TokenAssigner, redact_pdf


def _build_statement_pdf(path: str) -> None:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)

    header_lines = [
        "JPMorgan Chase Bank, N.A.",
        "Statement Period: 08/01/2026 - 08/31/2026",
        "GEORGE AKAI",
        "123 Main Street, Nairobi, Kenya",
        "Account Number: 000000790098252",
    ]
    y = 50
    for line in header_lines:
        page.insert_text((50, y), line, fontsize=11)
        y += 20

    # Below the header cutoff (792 * 0.35 ≈ 277) — a transaction table.
    body_lines = [
        "08/05/2026 Check Payment to John Smith Contracting          -1,250.00",
        "08/06/2026 ACH Debit Sysco Foods                              -523.10",
        "08/07/2026 SSN on file: 123-45-6789",
    ]
    y = 320
    for line in body_lines:
        page.insert_text((50, y), line, fontsize=10)
        y += 20

    doc.save(path)
    doc.close()


def _extract_all_text(path: str) -> str:
    doc = fitz.open(path)
    try:
        return "\n".join(page.get_text("text") for page in doc)
    finally:
        doc.close()


@pytest.fixture(scope="module")
def redacted_statement(tmp_path_factory):
    """Built once per test module — spaCy model inference isn't free, and
    every test below just asserts on the same redacted output."""
    tmp_dir = tmp_path_factory.mktemp("pii_redactor")
    input_path = str(tmp_dir / "statement.pdf")
    output_path = str(tmp_dir / "statement_redacted.pdf")
    _build_statement_pdf(input_path)
    token_map = redact_pdf(input_path, output_path)
    return output_path, token_map


class TestHeaderRedaction:
    def test_account_holder_name_is_redacted(self, redacted_statement):
        output_path, _ = redacted_statement
        assert "GEORGE AKAI" not in _extract_all_text(output_path)

    def test_address_is_redacted(self, redacted_statement):
        output_path, _ = redacted_statement
        text = _extract_all_text(output_path)
        assert "123 Main Street" not in text
        assert "Nairobi" not in text

    def test_account_number_is_redacted(self, redacted_statement):
        output_path, _ = redacted_statement
        assert "000000790098252" not in _extract_all_text(output_path)

    def test_ssn_is_redacted(self, redacted_statement):
        output_path, _ = redacted_statement
        assert "123-45-6789" not in _extract_all_text(output_path)

    def test_institution_name_survives_as_org_not_person(self, redacted_statement):
        # ORG entities (the bank itself) are never a redaction target —
        # only PERSON (the account holder) is.
        output_path, _ = redacted_statement
        assert "JPMorgan Chase Bank" in _extract_all_text(output_path)


class TestTransactionTablePreserved:
    def test_transaction_payee_names_are_not_redacted(self, redacted_statement):
        # The whole point of bank-transaction extraction is knowing who was
        # paid — redacting every PERSON in the transaction table would gut
        # that, so only the header gets aggressive name redaction.
        output_path, _ = redacted_statement
        text = _extract_all_text(output_path)
        assert "John Smith Contracting" in text
        assert "Sysco Foods" in text

    def test_transaction_amounts_and_dates_survive(self, redacted_statement):
        output_path, _ = redacted_statement
        text = _extract_all_text(output_path)
        assert "-1,250.00" in text
        assert "-523.10" in text
        assert "08/05/2026" in text
        assert "08/06/2026" in text


class TestTokenMap:
    def test_token_map_keys_are_original_values(self, redacted_statement):
        _, token_map = redacted_statement
        assert token_map["GEORGE AKAI"].startswith("[CLIENT_NAME_")
        assert token_map["000000790098252"].startswith("[ACCOUNT_NUM_")
        assert token_map["123-45-6789"].startswith("[SSN_")

    def test_no_token_for_preserved_payee_names(self, redacted_statement):
        _, token_map = redacted_statement
        assert "John Smith Contracting" not in token_map
        assert "Sysco Foods" not in token_map


class TestTokenAssigner:
    def test_same_value_gets_same_token(self):
        assigner = _TokenAssigner()
        first = assigner.token_for("GEORGE AKAI", "PERSON")
        second = assigner.token_for("GEORGE AKAI", "PERSON")
        assert first == second

    def test_distinct_values_get_distinct_incrementing_tokens(self):
        assigner = _TokenAssigner()
        assert assigner.token_for("GEORGE AKAI", "PERSON") == "[CLIENT_NAME_1]"
        assert assigner.token_for("JANE DOE", "PERSON") == "[CLIENT_NAME_2]"

    def test_different_entity_types_get_independent_counters(self):
        assigner = _TokenAssigner()
        assert assigner.token_for("GEORGE AKAI", "PERSON") == "[CLIENT_NAME_1]"
        assert assigner.token_for("Nairobi", "LOCATION") == "[ADDRESS_1]"


class TestNoTextPdf:
    def test_pdf_with_no_extractable_text_returns_empty_map(self, tmp_path):
        # A blank page (no inserted text) — nothing to analyze, nothing to
        # redact, and redact_pdf must not raise.
        input_path = str(tmp_path / "blank.pdf")
        output_path = str(tmp_path / "blank_redacted.pdf")
        doc = fitz.open()
        doc.new_page(width=612, height=792)
        doc.save(input_path)
        doc.close()

        token_map = redact_pdf(input_path, output_path)
        assert token_map == {}
