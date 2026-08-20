"""RabbitMQ queue consumer for document processing events."""

import json
import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import aio_pika
import boto3
import httpx
from aio_pika.abc import AbstractIncomingMessage
from pdf2image import convert_from_path

from app.config import settings
from app.services.ocr_service import OCRService
from app.services.reconciliation import _validate_and_reconcile_statement
from app.services.vision_extraction_service import VisionExtractionService

logger = logging.getLogger(__name__)


class QueueConsumer:
    """
    Consumes document upload events from RabbitMQ and processes them.

    Event flow:
    1. Core API uploads document -> publishes 'documents.received' event
    2. Worker consumes event -> downloads from S3/MinIO -> runs OCR
    3. Worker POSTs extracted fields back to Core API's internal callback,
       which updates the document's status and persists ExtractedData.
    """

    def __init__(self, ocr_service: OCRService, vision_service: VisionExtractionService | None = None):
        self.ocr_service = ocr_service
        self.vision_service = vision_service
        self.connection: aio_pika.Connection | None = None
        self.channel: aio_pika.Channel | None = None
        self.queue: aio_pika.Queue | None = None
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )
        self.http_client = httpx.AsyncClient(timeout=10.0)

    async def start(self):
        """Start consuming messages from RabbitMQ."""
        try:
            self.connection = await aio_pika.connect_robust(
                host=settings.RABBITMQ_HOST,
                port=settings.RABBITMQ_PORT,
                login=settings.RABBITMQ_USERNAME,
                password=settings.RABBITMQ_PASSWORD,
                virtualhost=settings.RABBITMQ_VIRTUAL_HOST,
                ssl=settings.RABBITMQ_SSL_ENABLED,
            )

            self.channel = await self.connection.channel()
            await self.channel.set_qos(prefetch_count=1)  # Process one message at a time

            self.queue = await self.channel.declare_queue(
                settings.RABBITMQ_QUEUE_DOCUMENTS, durable=True
            )

            await self.queue.consume(self.process_message)
            logger.info(f"Started consuming from queue: {settings.RABBITMQ_QUEUE_DOCUMENTS}")

        except Exception as e:
            logger.error(f"Failed to start queue consumer: {e}")
            raise

    async def stop(self):
        """Stop consuming and close connections."""
        await self.http_client.aclose()
        if self.vision_service:
            await self.vision_service.aclose()
        if self.connection:
            await self.connection.close()
            logger.info("Queue consumer stopped")

    async def process_message(self, message: AbstractIncomingMessage):
        """
        Process a document upload event.

        Expected message format:
        {
            "document_id": "uuid",
            "tenant_id": "uuid",
            "storage_key": "tenant-id/uuid/file.pdf",
            "filename": "receipt.pdf",
            "content_type": "application/pdf"
        }
        """
        async with message.process():
            event = json.loads(message.body.decode())
            document_id = event.get("document_id")
            logger.info(f"Processing document: {document_id}")

            try:
                with TemporaryDirectory() as tmpdir:
                    image_paths = self._download_and_prepare_images(event, Path(tmpdir))
                    result = await self._extract(image_paths)

                status = (
                    "EXTRACTED"
                    if result["confidence"] >= settings.OCR_CONFIDENCE_THRESHOLD
                    else "REVIEW_REQUIRED"
                )
                await self._send_callback(document_id, result, status)
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
                    )
                except Exception:
                    logger.error(f"Also failed to report failure for document {document_id}")
                raise

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

    def _download_and_prepare_images(self, event: dict, tmpdir: Path) -> list[Path]:
        """Downloads the source file and returns paths to images Tesseract can read.

        PDFs are converted page-by-page (capped at settings.MAX_PDF_PAGES, so
        an unusually long statement can't stall the worker) so multi-page
        receipts/invoices get OCR'd in full rather than just their first page.
        """
        storage_key = event["storage_key"]
        content_type = event.get("content_type", "")
        suffix = Path(event.get("filename", "")).suffix or ".bin"
        source_path = tmpdir / f"source{suffix}"

        self.s3_client.download_file(settings.S3_BUCKET_DOCUMENTS, storage_key, str(source_path))

        if content_type == "application/pdf" or suffix.lower() == ".pdf":
            pages = convert_from_path(
                str(source_path), dpi=200, first_page=1, last_page=settings.MAX_PDF_PAGES
            )
            image_paths = []
            for i, page in enumerate(pages, start=1):
                image_path = tmpdir / f"page-{i}.png"
                page.save(image_path, "PNG")
                image_paths.append(image_path)
            return image_paths

        return [source_path]

    async def _send_callback(self, document_id: str, result: dict, status: str) -> None:
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
            "status": status,
        }
        response = await self.http_client.post(
            f"{settings.CORE_API_URL}/api/v1/internal/documents/{document_id}/extraction",
            json=payload,
            headers={"X-Internal-Api-Key": settings.INTERNAL_API_KEY},
        )
        response.raise_for_status()
