# Terraform: GCP deploy infra

Manages the infra *around* deploys — Artifact Registry, Secret Manager
secret containers, Cloud Run invoker IAM, and the Cloud Build triggers
(including their substitution variables). It deliberately does **not**
manage the Cloud Run services themselves: `gcloud run deploy` inside each
app's `cloudbuild.yaml` fully owns image + env vars on every push, and a
second owner in Terraform would fight it — the next `terraform apply`
would try to roll the service back to whatever image/env Terraform last
knew about.

The payoff: today, changing a Cloud Build substitution variable (say,
`_CORS_ALLOWED_ORIGINS`) means a trip to Console → trigger → Edit. After
this is applied once, it's a one-line change in `terraform.tfvars` +
`terraform apply`, reviewed in a diff like any other code change.

## One-time setup

Everything below needs live GCP access, which this session didn't have
(`gcloud` credentials needed an interactive reauth this sandbox couldn't
do). Run these yourself.

```bash
gcloud auth login
gcloud auth application-default login   # terraform's google provider uses ADC
gcloud config set project hallowed-index-504918-b4
```

Create the state bucket (matches `versions.tf`'s backend config):

```bash
gsutil mb -l europe-west1 gs://akihlee-terraform-state
gsutil versioning set on gs://akihlee-terraform-state
```

Pull the real Cloud Build substitution values (currently Console-only)
and put them in `terraform.tfvars` (copy from `terraform.tfvars.example`,
which is gitignored):

```bash
gcloud builds triggers list --region=europe-west1 --format="table(name,id)"
gcloud builds triggers describe <core-api-trigger-name> --region=europe-west1 --format="yaml(substitutions)"
gcloud builds triggers describe <document-worker-trigger-name> --region=europe-west1 --format="yaml(substitutions)"
```

Also confirm the two trigger `name` values in `cloudbuild_triggers.tf`
match what that first command lists — they're a guess (`akihlee-api`,
`document-worker`) based on the Cloud Run service names, and import
matches by resource ID, not by the `name` in this config, so a mismatch
there won't block import but will show as a rename diff afterward.

## Import existing resources

```bash
cd infrastructure/terraform
terraform init

terraform import google_artifact_registry_repository.cloud_run_source_deploy \
  projects/hallowed-index-504918-b4/locations/europe-west1/repositories/cloud-run-source-deploy

for s in JWT_SECRET DATABASE_PASSWORD S3_SECRET_KEY \
         INTERNAL_API_KEY SQUARE_OAUTH_CLIENT_SECRET SQUARE_ACCESS_TOKEN \
         QUICKBOOKS_OAUTH_CLIENT_SECRET QUICKBOOKS_TOKEN_ENCRYPTION_KEY \
         AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  terraform import "google_secret_manager_secret.this[\"$s\"]" \
    "projects/hallowed-index-504918-b4/secrets/$s"
done

terraform import google_cloud_run_v2_service_iam_member.core_api_public \
  "projects/hallowed-index-504918-b4/locations/europe-west1/services/akihlee-api roles/run.invoker allUsers"

# document-worker is no longer public (see pubsub.tf) — only import
# document_worker_pubsub_invoker below once the Pub/Sub migration's manual
# gcloud setup has actually been run (topic/subscription/push-invoker SA
# don't exist yet otherwise, and there's nothing to import). pubsub.tf's
# other resources (topic, subscription, service account) are brand new
# too — they have no import command here; either `terraform apply` them
# fresh at that point, or import each individually first.
terraform import google_cloud_run_v2_service_iam_member.document_worker_pubsub_invoker \
  "projects/hallowed-index-504918-b4/locations/europe-west1/services/document-worker roles/run.invoker serviceAccount:pubsub-push-invoker@hallowed-index-504918-b4.iam.gserviceaccount.com"

# Use the trigger IDs from `gcloud builds triggers list` above, not the names.
terraform import google_cloudbuild_trigger.core_api "projects/hallowed-index-504918-b4/locations/europe-west1/triggers/<core-api-trigger-id>"
terraform import google_cloudbuild_trigger.document_worker "projects/hallowed-index-504918-b4/locations/europe-west1/triggers/<document-worker-trigger-id>"
```

Then:

```bash
terraform plan
```

**Expect zero diff.** If plan wants to change something, stop and
reconcile the `.tf` file to match the live resource before ever running
apply — don't apply a diff you haven't accounted for on a production
project. The most likely mismatches: the secret `replication` block
(`secrets.tf` assumes `auto {}` — verify with `gcloud secrets describe
<name> --format="yaml(replication)"`), and the trigger `name` /
`substitutions` values.

Once `plan` is clean, Terraform is safely the source of truth for these
resources and normal `terraform apply` workflow applies going forward.

## Possible follow-ups (not done here — each is a live behavior change, not just scaffolding)

- `included_files` on each trigger, so a core-api-only push doesn't
  rebuild document-worker and vice versa (currently unverified whether
  either trigger already filters by path).
- IAM bindings for the Cloud Build service account itself
  (`roles/run.admin`, `roles/secretmanager.secretAccessor`, etc.) —
  skipped here since a wrong binding could break every future deploy,
  and the current permissions are unverified from this sandbox.
