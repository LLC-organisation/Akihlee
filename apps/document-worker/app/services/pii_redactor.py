"""PII redaction for bank statement (and other) PDFs, run before OCR/vision
extraction so a third-party LLM (Claude on Bedrock) never sees an account
holder's name, address, SSN, or account number. Reversible: the token map
this returns is what lets core-api show real values back to the tenant's
own users later — this redacts from the AI vendor, not from the business
itself (see PiiRehydrationService.java on the core-api side).

Scope is deliberately asymmetric between the header and the rest of the
document:
- Page 1's top 35% (the header, where a statement prints the account
  holder's name/address and the account number) gets an aggressive scrub
  of names, addresses, and account numbers.
- The rest of the document (the transaction table, potentially spanning
  many pages) only has account numbers and SSNs/Tax IDs redacted — a
  transaction's payee name is exactly what Akihlee's bank-transaction
  extraction is built to capture (BankTransaction.payeeOrPayer), so
  blindly redacting every PERSON entity throughout the statement would
  gut the product's core function, not just remove incidental PII.

Redaction is applied at the PDF vector layer via PyMuPDF's redaction
annotations, which (unlike merely deleting a text run) both erase the
underlying text stream AND paint over the region when the page is
rendered — necessary here since the redacted PDF gets rasterized to PNG
for both Tesseract and the vision model, so "erased from the text layer
but still visible when rendered" would defeat the whole point.
"""

import logging
import re
from pathlib import Path
from typing import Any

import pymupdf as fitz  # `import fitz` directly is deprecated as of PyMuPDF 1.24+

logger = logging.getLogger(__name__)

# Fraction of page 1's height, from the top, treated as the "header" for the
# aggressive name/address/account-number pass.
_HEADER_HEIGHT_FRACTION = 0.35

# Requires the word "account" nearby rather than a bare N-digit scan — a
# blind 8+-digit regex would also catch check numbers, routing numbers, and
# reference IDs throughout the transaction table, corrupting data the
# extraction pipeline actually needs. [\d\- ] (not \s) so the digit group
# can't stretch across a line break onto unrelated text.
_ACCOUNT_NUMBER_PATTERN = re.compile(
    r"\baccount\s*(?:number|no\.?|#)?\s*[:\-]?\s*(\d[\d\- ]{6,}\d)\b", re.IGNORECASE
)
# US SSN (XXX-XX-XXXX) and EIN/Tax ID (XX-XXXXXXX) — both unambiguous;
# neither plausibly collides with a transaction amount or date.
_SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_EIN_PATTERN = re.compile(r"\b\d{2}-\d{7}\b")
# spaCy's LOCATION/GPE recognition catches known place names (a city,
# country) but not a generic street address — this catches the common
# "<number> <street name> <suffix>" shape as a deterministic complement,
# same reasoning the account-number pattern above uses.
_STREET_ADDRESS_PATTERN = re.compile(
    r"\b\d{1,6}\s+[A-Za-z0-9.,'\s]{2,40}?\b(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|"
    r"Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)\b\.?",
    re.IGNORECASE,
)
# Below this length, a LOCATION match is almost always a false positive
# (e.g. spaCy's small model tagging a bank's own "N.A." suffix as a
# place) rather than a real address fragment — real place names are
# essentially never this short.
_MIN_LOCATION_LENGTH = 5

# A whole header line that's plausibly nothing but a personal name (2-4
# words/tokens, alphabetic only, comma- or space-separated) — a
# deterministic complement to spaCy's NER, same reasoning as
# _STREET_ADDRESS_PATTERN above. Needed because en_core_web_sm empirically
# does NOT reliably span a full "FIRST MIDDLE LAST" name printed the way
# statement headers actually print it: it silently truncates ("JANE MARIE
# DOE" -> only "JANE MARIE", dropping the surname entirely), mis-tags a
# hyphenated first name as a too-short LOCATION instead of PERSON
# ("ANNA-LISE VANDERBERG" -> only "ANNA" as LOCATION, which the length
# floor above then drops too, leaving the whole name unredacted), or
# misses a last-name-first line entirely ("DOE, JANE MARIE" -> only "JANE
# MARIE", "DOE" left untouched). Each of these leaves part or all of the
# account holder's actual legal name in the redacted output, in direct
# contradiction of this module's whole purpose — so once NER signals ANY
# PERSON/LOCATION presence on a line this shaped (see _redact_header), the
# entire line is redacted rather than trusting NER's own span boundary.
_BARE_NAME_LINE_PATTERN = re.compile(r"^[A-Za-z][A-Za-z'\-]*(?:[,\s]+[A-Za-z][A-Za-z'\-]*){1,3}$")
# Header lines that are plausibly name-shaped but aren't a person's name —
# excluded so the fallback above doesn't over-redact ordinary institution/
# product/boilerplate lines that happen to be 2-4 alphabetic words.
_NAME_LINE_EXCLUDE_KEYWORDS = re.compile(
    r"\b(bank|na|checking|savings|summary|statement|account|street|st|avenue|ave|road|rd|"
    r"boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|center|service|page|member|fdic)\b",
    re.IGNORECASE,
)

_TOKEN_LABELS = {
    "PERSON": "CLIENT_NAME",
    "LOCATION": "ADDRESS",
    "ACCOUNT_NUMBER": "ACCOUNT_NUM",
    "SSN": "SSN",
    "EIN": "TAX_ID",
}

_analyzer_engine: Any = None


def _get_analyzer():
    """Lazy singleton — spaCy model loading is slow (hundreds of ms to a
    few seconds), so this must happen once per process, not once per
    document. Imported lazily too: importing presidio_analyzer eagerly at
    module load would slow down every code path that imports this module,
    including tests that never touch redaction.
    """
    global _analyzer_engine
    if _analyzer_engine is None:
        from presidio_analyzer import AnalyzerEngine
        from presidio_analyzer.nlp_engine import NlpEngineProvider

        provider = NlpEngineProvider(nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
        })
        _analyzer_engine = AnalyzerEngine(nlp_engine=provider.create_engine(), supported_languages=["en"])
    return _analyzer_engine


class _TokenAssigner:
    """Assigns a stable token per distinct original value — the same name
    appearing three times on a page gets the same token, not three."""

    def __init__(self):
        self.token_map: dict[str, str] = {}
        self._counters: dict[str, int] = {}

    def token_for(self, original: str, entity_type: str) -> str:
        original = original.strip()
        if original in self.token_map:
            return self.token_map[original]
        label = _TOKEN_LABELS.get(entity_type, entity_type)
        self._counters[label] = self._counters.get(label, 0) + 1
        token = f"[{label}_{self._counters[label]}]"
        self.token_map[original] = token
        return token


def _redact_matches(page: fitz.Page, text: str, entity_type: str, assigner: _TokenAssigner, clip: fitz.Rect | None = None) -> None:
    if not text:
        return
    for rect in page.search_for(text, clip=clip):
        token = assigner.token_for(text, entity_type)
        page.add_redact_annot(rect, text=token, fill=(1, 1, 1), text_color=(0, 0, 0))


def _redact_header(page: fitz.Page, assigner: _TokenAssigner) -> None:
    """Aggressive PERSON/LOCATION pass on page 1's top
    _HEADER_HEIGHT_FRACTION — where a statement prints the account holder's
    name and address (account numbers are handled separately, document-wide,
    by _redact_account_numbers_and_tax_ids). Bank/institution names are ORG
    entities, not PERSON, so Presidio's PERSON recognizer leaves them
    alone — the merchant/institution field extraction downstream still
    works on a redacted statement.
    """
    header_rect = fitz.Rect(0, 0, page.rect.width, page.rect.height * _HEADER_HEIGHT_FRACTION)
    header_text = page.get_textbox(header_rect)
    if not header_text.strip():
        return

    analyzer = _get_analyzer()
    # Analyzed line-by-line, not as one multi-line blob. Empirically,
    # en_core_web_sm's NER misses an all-caps account holder name (a very
    # common way statements print it) when it's mixed into the same
    # multi-line context as dates and an institution name, but reliably
    # catches the identical text analyzed on its own — a real limitation
    # of the small model's contextual disambiguation, not a fluke.
    for line in header_text.splitlines():
        line = line.strip()
        if not line:
            continue
        line_entities = list(analyzer.analyze(text=line, entities=["PERSON", "LOCATION"], language="en"))

        # Whole-line name fallback takes priority over the individual NER
        # spans below — see _BARE_NAME_LINE_PATTERN. Redacting only NER's
        # own (possibly truncated or mistyped) span here would risk
        # leaving part of the actual name in the output, which is exactly
        # the failure this exists to close, so this `continue`s past the
        # granular per-entity loop for the line rather than doing both.
        if (
            line_entities
            and _BARE_NAME_LINE_PATTERN.match(line)
            and not _NAME_LINE_EXCLUDE_KEYWORDS.search(line)
        ):
            _redact_matches(page, line, "PERSON", assigner, clip=header_rect)
            continue

        for result in line_entities:
            entity_text = line[result.start:result.end].strip()
            if not entity_text:
                continue
            if result.entity_type == "LOCATION" and len(entity_text) < _MIN_LOCATION_LENGTH:
                continue
            _redact_matches(page, entity_text, result.entity_type, assigner, clip=header_rect)
        for match in _STREET_ADDRESS_PATTERN.finditer(line):
            _redact_matches(page, match.group(0), "LOCATION", assigner, clip=header_rect)
    # Account numbers are handled once, uniformly, by
    # _redact_account_numbers_and_tax_ids below (which already covers page
    # 1 unclipped) — no separate header-scoped pass here, which would
    # otherwise double-process the same header text.


def _redact_account_numbers_and_tax_ids(page: fitz.Page, assigner: _TokenAssigner) -> None:
    """Runs across the whole page (not just the header) — an account
    number or SSN can legitimately appear in a footer, a "continued on
    next page" recap, or a per-page account summary line, unlike a
    person's name, which is only redacted where it can't collide with a
    transaction payee (see module docstring).
    """
    text = page.get_text("text")
    if not text.strip():
        return
    for match in _ACCOUNT_NUMBER_PATTERN.finditer(text):
        _redact_matches(page, match.group(1), "ACCOUNT_NUMBER", assigner)
    for match in _SSN_PATTERN.finditer(text):
        _redact_matches(page, match.group(0), "SSN", assigner)
    for match in _EIN_PATTERN.finditer(text):
        _redact_matches(page, match.group(0), "EIN", assigner)


def redact_pdf(input_path: str, output_path: str) -> dict[str, str]:
    """Redacts PII from a PDF and writes the result to output_path.
    Returns a map of {original_value: token} for every value redacted —
    empty if the PDF has no extractable text (e.g. a pure-image scan,
    which Tesseract/vision would struggle with anyway) or nothing matched.
    """
    assigner = _TokenAssigner()
    doc = fitz.open(input_path)
    try:
        if len(doc) > 0:
            _redact_header(doc[0], assigner)
        for page in doc:
            _redact_account_numbers_and_tax_ids(page, assigner)
        for page in doc:
            page.apply_redactions()  # no-op on a page with no pending redaction annotations
        doc.save(output_path)
    finally:
        doc.close()

    if assigner.token_map:
        logger.info(f"Redacted {len(assigner.token_map)} PII value(s) from {Path(input_path).name}")
    return assigner.token_map
