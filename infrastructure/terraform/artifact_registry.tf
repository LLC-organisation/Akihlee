# Matches the existing repo referenced by _AR_REPOSITORY in both
# cloudbuild.yaml files. Import before applying — see README.md.
resource "google_artifact_registry_repository" "cloud_run_source_deploy" {
  location      = var.region
  repository_id = "cloud-run-source-deploy"
  format        = "DOCKER"
  description   = "Docker images for core-api and document-worker Cloud Run deploys."
}
