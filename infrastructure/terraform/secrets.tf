# Secret *containers* only — Terraform never touches secret values.
# Versions are added out-of-band with `gcloud secrets versions add`, same
# as today, so no secret material ever lands in a .tf file or tfstate.
#
# This is the union of every secret referenced by --set-secrets across
# both apps/core-api/cloudbuild.yaml and apps/document-worker/cloudbuild.yaml.
locals {
  secret_names = toset([
    "JWT_SECRET",
    "DATABASE_PASSWORD",
    "S3_SECRET_KEY",
    "INTERNAL_API_KEY",
    "SQUARE_OAUTH_CLIENT_SECRET",
    "SQUARE_ACCESS_TOKEN",
    "QUICKBOOKS_OAUTH_CLIENT_SECRET",
    "QUICKBOOKS_TOKEN_ENCRYPTION_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
  ])
}

resource "google_secret_manager_secret" "this" {
  for_each  = local.secret_names
  secret_id = each.value

  # Verify this matches the live replication policy before importing
  # (`gcloud secrets describe <name> --format="yaml(replication)"`) —
  # replication policy is immutable after creation, so a mismatch here
  # will show up as a permanent plan diff, not something apply can fix.
  replication {
    auto {}
  }
}
