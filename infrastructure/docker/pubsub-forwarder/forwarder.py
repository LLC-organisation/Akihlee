"""
Local-dev only. The official Pub/Sub emulator doesn't support push
subscriptions (only pull), so this pull-subscribes from the emulator and
forwards each message to document-worker's push endpoint over HTTP,
wrapped in the same envelope shape real Pub/Sub push delivery uses. This
script never runs in production — Pub/Sub pushes to document-worker
directly there.
"""

import base64
import os

import httpx
from google.cloud import pubsub_v1

PROJECT_ID = os.environ.get("PUBSUB_PROJECT_ID", "akihlee-dev-local")
TOPIC_ID = os.environ.get("PUBSUB_TOPIC", "documents-received")
SUBSCRIPTION_ID = os.environ.get("PUBSUB_SUBSCRIPTION", "documents-received-push")
PUSH_ENDPOINT = os.environ["PUSH_ENDPOINT"]

publisher = pubsub_v1.PublisherClient()
subscriber = pubsub_v1.SubscriberClient()
topic_path = publisher.topic_path(PROJECT_ID, TOPIC_ID)
subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION_ID)

# The emulator is in-memory and resets on every restart, so these have to
# be (re-)created on each startup rather than assumed to exist.
try:
    publisher.create_topic(request={"name": topic_path})
except Exception:
    pass  # already exists

try:
    subscriber.create_subscription(request={"name": subscription_path, "topic": topic_path})
except Exception:
    pass  # already exists

http_client = httpx.Client(timeout=310.0)


def callback(message: pubsub_v1.subscriber.message.Message) -> None:
    envelope = {
        "message": {
            "data": base64.b64encode(message.data).decode(),
            "messageId": message.message_id,
            "attributes": dict(message.attributes),
        },
        "subscription": subscription_path,
    }
    try:
        response = http_client.post(PUSH_ENDPOINT, json=envelope)
        if response.status_code < 300:
            message.ack()
        else:
            message.nack()
    except httpx.HTTPError:
        message.nack()


if __name__ == "__main__":
    future = subscriber.subscribe(subscription_path, callback=callback)
    print(f"Forwarding {subscription_path} -> {PUSH_ENDPOINT}", flush=True)
    try:
        future.result()
    except KeyboardInterrupt:
        future.cancel()
