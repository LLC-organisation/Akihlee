terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # State is kept in GCS, not locally, so a solo dev running `terraform
  # apply` from a laptop can't diverge from what was last applied — and so
  # state isn't just sitting on disk for a production project. Create the
  # bucket once (see README.md) before running `terraform init`.
  backend "gcs" {
    bucket = "akihlee-terraform-state"
    prefix = "gcp-infra"
  }
}
