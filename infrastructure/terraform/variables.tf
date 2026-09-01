variable "project_id" {
  description = "GCP project hosting core-api and document-worker."
  type        = string
  default     = "hallowed-index-504918-b4"
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry, and Cloud Build triggers."
  type        = string
  default     = "europe-west1"
}

variable "project_number" {
  description = "GCP project number (distinct from project_id) — used to address the default compute service account and Google-managed service agents, and to build Cloud Run service URLs."
  type        = string
  default     = "302086001342"
}

variable "github_owner" {
  description = "GitHub org that owns the repo, for Cloud Build trigger source config."
  type        = string
  default     = "LLC-organisation"
}

variable "github_repo" {
  description = "GitHub repo name, for Cloud Build trigger source config."
  type        = string
  default     = "Akihlee"
}

variable "deploy_branch" {
  description = "Branch that Cloud Build triggers deploy from on push."
  type        = string
  default     = "^main$"
}

# --- Cloud Build substitution variables -------------------------------
# These carry non-secret runtime config (see the comment block at the top
# of each app's cloudbuild.yaml). They currently live only in the Cloud
# Build trigger's Console config, which is exactly the kind of drift this
# Terraform setup replaces. Fill these from the live trigger config with:
#   gcloud builds triggers describe <trigger-name> --region=<region> \
#     --format="yaml(substitutions)"
# before the first `terraform apply` (see README.md import runbook).

variable "core_api_substitutions" {
  description = "Non-secret substitution variables for the core-api Cloud Build trigger."
  type        = map(string)
  default     = {}
}

variable "document_worker_substitutions" {
  description = "Non-secret substitution variables for the document-worker Cloud Build trigger."
  type        = map(string)
  default     = {}
}
