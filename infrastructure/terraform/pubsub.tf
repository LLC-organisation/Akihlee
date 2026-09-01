# Replaces CloudAMQP/RabbitMQ as the document-received event transport.
# core-api publishes here; document-worker receives pushes via an
# authenticated HTTP subscription rather than pulling from a persistent
# connection — see apps/document-worker/app/routers/pubsub.py.

resource "google_pubsub_topic" "documents_received" {
  name = "documents-received"
}

# Minimal identity used only as the OIDC token Pub/Sub presents when
# pushing to document-worker — granted no roles beyond run.invoker on that
# one service (see iam.tf), never used as a client-library credential.
resource "google_service_account" "pubsub_push_invoker" {
  account_id   = "pubsub-push-invoker"
  display_name = "Pub/Sub push invoker for document-worker"
}

resource "google_pubsub_subscription" "documents_received_push" {
  name  = "documents-received-push"
  topic = google_pubsub_topic.documents_received.name

  # Comfortably exceeds VISION_EXTRACTION_TIMEOUT_SECONDS (150s) plus OCR/
  # download overhead and matches document-worker's Cloud Run --timeout,
  # so a slow-but-in-flight request isn't mistaken for failed and
  # redelivered while the original is still running.
  ack_deadline_seconds = 300

  push_config {
    # Confirmed via `gcloud run services describe document-worker
    # --format="value(status.url)"` — Cloud Run's URL format isn't
    # consistent across services in this project (core-api uses the older
    # project-number-based format), so don't assume a pattern here.
    push_endpoint = "https://document-worker-kyfyydcn4a-ew.a.run.app/internal/pubsub/documents-received"

    oidc_token {
      service_account_email = google_service_account.pubsub_push_invoker.email
    }
  }
}

resource "google_pubsub_topic_iam_member" "core_api_publisher" {
  topic  = google_pubsub_topic.documents_received.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${var.project_number}-compute@developer.gserviceaccount.com"
}

# Lets Pub/Sub mint OIDC tokens as the push-invoker identity when calling
# document-worker. `gcloud pubsub subscriptions create
# --push-auth-service-account=...` grants this automatically — codified
# here so a future `terraform apply` doesn't silently need it re-added.
resource "google_service_account_iam_member" "pubsub_can_impersonate_push_invoker" {
  service_account_id = google_service_account.pubsub_push_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}
