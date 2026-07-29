"""RabbitMQ queue consumer for document processing events."""

import asyncio
import json
import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import aio_pika
from aio_pika.abc import AbstractIncomingMessage

from app.config import settings
from app.services.ocr_service import OCRService

logger = logging.getLogger(__name__)


class QueueConsumer:
    """
    Consumes document upload events from RabbitMQ and processes them.

    Event flow:
    1. Core API uploads document → publishes 'document.received' event
    2. Worker consumes event → downloads from S3 → runs OCR
    3. Worker publishes 'document.extracted' event with results
    4. Core API consumes results → updates database
    """

    def __init__(self, ocr_service: OCRService):
        self.ocr_service = ocr_service
        self.connection: aio_pika.Connection | None = None
        self.channel: aio_pika.Channel | None = None
        self.queue: aio_pika.Queue | None = None

    async def start(self):
        """Start consuming messages from RabbitMQ."""
        try:
            # Connect to RabbitMQ
            self.connection = await aio_pika.connect_robust(
                host=settings.RABBITMQ_HOST,
                port=settings.RABBITMQ_PORT,
                login=settings.RABBITMQ_USERNAME,
                password=settings.RABBITMQ_PASSWORD,
            )

            self.channel = await self.connection.channel()
            await self.channel.set_qos(prefetch_count=1)  # Process one message at a time

            # Declare queue
            self.queue = await self.channel.declare_queue(
                settings.RABBITMQ_QUEUE_DOCUMENTS, durable=True
            )

            # Start consuming
            await self.queue.consume(self.process_message)
            logger.info(f"Started consuming from queue: {settings.RABBITMQ_QUEUE_DOCUMENTS}")

        except Exception as e:
            logger.error(f"Failed to start queue consumer: {e}")
            raise

    async def stop(self):
        """Stop consuming and close connections."""
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
            "storage_key": "tenant-id/file.pdf",
            "filename": "receipt.pdf",
            "content_type": "application/pdf"
        }
        """
        async with message.process():
            try:
                event = json.loads(message.body.decode())
                logger.info(f"Processing document: {event.get('document_id')}")

                # TODO: Download file from S3
                # TODO: Run OCR extraction
                # TODO: Publish results to 'document.extracted' queue

                # Placeholder
                result = await self.ocr_service.extract_receipt_fields(Path("/tmp/placeholder"))

                logger.info(f"Processed document {event.get('document_id')}: {result['status']}")

            except Exception as e:
                logger.error(f"Error processing message: {e}")
                # Message will be requeued automatically if not acknowledged
                raise
