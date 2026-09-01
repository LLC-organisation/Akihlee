# The substitution variables here are today set by hand in Console (per
# the comment block at the top of each cloudbuild.yaml). That's the actual
# "faster deploys" win of this file: changing a runtime config value
# becomes a one-line diff + `terraform apply` instead of a Console trip.
#
# `name` below is a guess — confirm it against the live trigger before
# importing:
#   gcloud builds triggers list --region=<region> --format="table(name,id)"
# and correct it here if it doesn't match, since import matches by
# resource ID, not by this `name` attribute.

resource "google_cloudbuild_trigger" "core_api" {
  name     = "akihlee-api"
  location = var.region
  filename = "apps/core-api/cloudbuild.yaml"

  github {
    owner = var.github_owner
    name  = var.github_repo
    push {
      branch = var.deploy_branch
    }
  }

  substitutions = var.core_api_substitutions
}

resource "google_cloudbuild_trigger" "document_worker" {
  name     = "document-worker"
  location = var.region
  filename = "apps/document-worker/cloudbuild.yaml"

  github {
    owner = var.github_owner
    name  = var.github_repo
    push {
      branch = var.deploy_branch
    }
  }

  substitutions = var.document_worker_substitutions
}
