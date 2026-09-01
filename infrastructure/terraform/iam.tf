# Codifies --allow-unauthenticated from both cloudbuild.yaml Deploy steps.
# Cloud Build re-asserts this on every deploy too, so the two don't fight —
# this just makes the "who can invoke these services" answer live in code
# and get reviewed in a diff instead of only existing as a deploy flag.
resource "google_cloud_run_v2_service_iam_member" "core_api_public" {
  location = var.region
  name     = "akihlee-api"
  role     = "roles/run.invoker"
  member   = "allUsers"
}


# document-worker is no longer public — it only receives authenticated
# push deliveries from the documents-received-push subscription, invoked
# as the pubsub_push_invoker service account (see pubsub.tf).
resource "google_cloud_run_v2_service_iam_member" "document_worker_pubsub_invoker" {
  location = var.region
  name     = "document-worker"
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_push_invoker.email}"
}
