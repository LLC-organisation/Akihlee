output "artifact_registry_repository" {
  value = google_artifact_registry_repository.cloud_run_source_deploy.id
}

output "cloud_build_trigger_ids" {
  value = {
    core_api        = google_cloudbuild_trigger.core_api.trigger_id
    document_worker = google_cloudbuild_trigger.document_worker.trigger_id
  }
}
