"""Pub/Sub push endpoint for document processing events."""

import base64
import binascii
import json
import logging

from fastapi import APIRouter, Request, Response

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/documents-received")
async def handle_documents_received(request: Request):
    """
    Receives a push delivery from the 'documents-received-push' Pub/Sub
    subscription. IAM (Cloud Run's invoker check on the push service
    account) is what verifies the caller is really Pub/Sub — no token
    verification needed here.

    Always acks (204) once the envelope itself is parseable — processing
    failures are handled internally by DocumentProcessor (best-effort
    REVIEW_REQUIRED callback), matching this service's prior RabbitMQ
    behavior of one attempt then give up gracefully, rather than relying
    on Pub/Sub redelivery. Only a malformed envelope nacks (400), since
    that's the one case worth Pub/Sub retrying.
    """
    envelope = await request.json()
    message = envelope.get("message")
    if not message or "data" not in message:
        logger.error("Malformed Pub/Sub push envelope: missing message.data")
        return Response(status_code=400)

    try:
        payload = base64.b64decode(message["data"])
        event = json.loads(payload)
    except (binascii.Error, ValueError, json.JSONDecodeError) as e:
        logger.error(f"Malformed Pub/Sub message data: {e}")
        return Response(status_code=400)

    await request.app.state.document_processor.process_event(event)
    return Response(status_code=204)
