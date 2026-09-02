"""Document processing: downloads from S3, runs OCR/vision extraction, and reports results back to Core API."""

import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import boto3
import httpx
from pdf2image import convert_from_path

from app.config import settings
from app.services.ocr_service import OCRService
from app.services.pii_redactor import redact_pdf
from app.services.reconciliation import _validate_and_reconcile_statement
from app.services.vision_extraction_service import VisionExtractionService

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """
    Processes document upload events pushed from Pub/Sub.

    Event flow:
    1. Core API uploads document -> publishes to the 'documents-received' Pub/Sub topic
    2. Pub/Sub pushes the event to this worker -> downloads from S3/MinIO -> runs OCR
    3. Worker POSTs extracted fields back to Core API's internal callback,
       which updates the document's status and persists ExtractedData.
    """

    def __init__(self, ocr_service: OCRService, vision_service: VisionExtractionService | None = None):
        self.ocr_service = ocr_service
        self.vision_service = vision_service
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )
        self.http_client = httpx.AsyncClient(timeout=10.0)

    async def aclose(self):
        """Close shared clients on shutdown."""
        await self.http_client.aclose()
        if self.vision_service:
            await self.vision_service.aclose()

    async def process_event(self, event: dict) -> None:
        """
        Process a document upload event.

        Expected event format:
        {
            "document_id": "uuid",
            "tenant_id": "uuid",
            "storage_key": "tenant-id/uuid/file.pdf",
            "filename": "receipt.pdf",
            "content_type": "application/pdf"
        }

        Deliberately never raises — the push endpoint acks (204) regardless
        of outcome, matching this service's prior RabbitMQ behavior of one
        attempt then a best-effort REVIEW_REQUIRED, rather than relying on
        Pub/Sub redelivery for transient failures.
        """
        document_id = event.get("document_id")
        logger.info(f"Processing document: {document_id}")

        try:
            with TemporaryDirectory() as tmpdir:
                image_paths, pii_token_map = self._download_and_prepare_images(event, Path(tmpdir))
                result = await self._extract(image_paths)

            status = (
                "EXTRACTED"
                if result["confidence"] >= settings.OCR_CONFIDENCE_THRESHOLD
                else "REVIEW_REQUIRED"
            )
            await self._send_callback(document_id, result, status, pii_token_map)
            logger.info(
                f"Processed document {document_id}: {status} "
                f"(confidence={result['confidence']}, method={result.get('extraction_method')})"
            )

        except Exception as e:
            logger.error(f"Error processing document {document_id}: {e}")
            # Best-effort: let the user see it needs manual review rather
            # than leaving it stuck at PROCESSING forever.
            try:
                await self._send_callback(
                    document_id,
                    {
                        "merchant": None, "total_amount": None, "currency": "KES",
                        "date": None, "tax_amount": None, "line_items": [],
                        "raw_text": "", "confidence": 0.0,
                    },
                    "REVIEW_REQUIRED",
                    {},
                )
            except Exception:
                logger.error(f"Also failed to report failure for document {document_id}")

    async def _extract(self, image_paths: list[Path]) -> dict:
        """Vision LLM primary (if configured), regex/Tesseract fallback otherwise
        or on any vision failure — see VisionExtractionService for why a failure
        here is expected/handled rather than exceptional (Bedrock outages/
        timeouts, occasional non-JSON output). Either path's result is run
        through _validate_and_reconcile_statement before returning — see
        reconciliation.py for why that's a single shared call site rather
        than being invoked inside each engine.
        """
        if self.vision_service is not None:
            try:
                result = await self.vision_service.extract(image_paths)
                if result is not None:
                    result["extraction_method"] = "vision"
                    return _validate_and_reconcile_statement(result)
                logger.warning("Vision extraction returned no usable result, falling back to OCR")
            except Exception as e:
                logger.warning(f"Vision extraction raised, falling back to OCR: {e}")

        result = await self.ocr_service.extract_receipt_fields(image_paths)
        result["extraction_method"] = "regex"
        return _validate_and_reconcile_statement(result)

    def _download_and_prepare_images(self, event: dict, tmpdir: Path) -> tuple[list[Path], dict[str, str]]:
        """Downloads the source file and returns (image paths Tesseract/the
        vision model can read, PII token map).

        PDFs are converted page-by-page (capped at settings.MAX_PDF_PAGES, so
        an unusually long statement can't stall the worker) so multi-page
        receipts/invoices get OCR'd in full rather than just their first page.

        PII redaction runs on the PDF *before* rasterizing — a name/address/
        account-number/SSN redacted at the vector layer stays redacted once
        rasterized to PNG, so neither Tesseract nor the vision model (a
        third-party LLM call to Bedrock) ever sees the raw value. Only PDFs
        go through this — there's no text layer to redact in a photographed
        receipt image, and PyMuPDF's redaction is PDF-specific.
        """
        storage_key = event["storage_key"]
        content_type = event.get("content_type", "")
        suffix = Path(event.get("filename", "")).suffix or ".bin"
        source_path = tmpdir / f"source{suffix}"

        self.s3_client.download_file(settings.S3_BUCKET_DOCUMENTS, storage_key, str(source_path))

        pii_token_map: dict[str, str] = {}
        if content_type == "application/pdf" or suffix.lower() == ".pdf":
            if settings.PII_REDACTION_ENABLED:
                redacted_path = tmpdir / "source_redacted.pdf"
                try:
                    pii_token_map = redact_pdf(str(source_path), str(redacted_path))
                    source_path = redacted_path
                except Exception as e:
                    # Best-effort: an extraction that saw un-redacted PII is
                    # far better than one that never ran at all — never let
                    # a redaction bug block the document from processing.
                    logger.error(f"PII redaction failed, continuing on the original file: {e}")

            pages = convert_from_path(
                str(source_path), dpi=200, first_page=1, last_page=settings.MAX_PDF_PAGES
            )
            image_paths = []
            for i, page in enumerate(pages, start=1):
                image_path = tmpdir / f"page-{i}.png"
                page.save(image_path, "PNG")
                image_paths.append(image_path)
            return image_paths, pii_token_map

        return [source_path], pii_token_map

    async def _send_callback(self, document_id: str, result: dict, status: str, pii_token_map: dict[str, str]) -> None:
        payload = {
            "merchantName": result.get("merchant"),
            "transactionDate": result.get("date"),
            "totalAmount": result.get("total_amount"),
            "currency": result.get("currency", "KES"),
            "taxAmount": result.get("tax_amount"),
            "lineItems": result.get("line_items", []),
            "documentType": result.get("document_type", "RECEIPT"),
            "bankTransactions": result.get("bank_transactions", []),
            "rawText": result.get("raw_text", ""),
            "confidence": result.get("confidence", 0.0),
            "extractionMethod": result.get("extraction_method"),
            "piiTokenMap": pii_token_map,
            "status": status,
        }
        response = await self.http_client.post(
            f"{settings.CORE_API_URL}/api/v1/internal/documents/{document_id}/extraction",
            json=payload,
            headers={"X-Internal-Api-Key": settings.INTERNAL_API_KEY},
        )
        response.raise_for_status()
