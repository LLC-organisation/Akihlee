"""Application configuration using Pydantic settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Default values below are for LOCAL DEVELOPMENT ONLY.
    Override via .env file or environment variables in production.
    """

    # Application
    APP_NAME: str = "akihlee-document-worker"
    DEBUG: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8080"]

    # RabbitMQ (defaults for local dev - override in .env). Managed providers
    # like CloudAMQP put each instance on its own vhost (not "/") and require
    # TLS on port 5671 — mirrors core-api's spring.rabbitmq.ssl.enabled/
    # virtual-host, which needed the same fix for the same reason.
    RABBITMQ_HOST: str = "localhost"
    RABBITMQ_PORT: int = 5672
    RABBITMQ_USERNAME: str = "akihlee"
    RABBITMQ_PASSWORD: str = "dev_rabbitmq_password"
    RABBITMQ_VIRTUAL_HOST: str = "/"
    RABBITMQ_SSL_ENABLED: bool = False
    RABBITMQ_QUEUE_DOCUMENTS: str = "documents.received"
    RABBITMQ_QUEUE_RESULTS: str = "documents.extracted"

    # S3/MinIO
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "akihlee"
    S3_SECRET_KEY: str = "dev_minio_password_min_8_chars"
    S3_BUCKET_DOCUMENTS: str = "documents"

    # Database (for updating document status)
    DATABASE_URL: str = "postgresql+asyncpg://akihlee:dev_password_change_in_production@localhost:5432/akihlee_dev"

    # OCR Configuration
    TESSERACT_PATH: str | None = None  # Auto-detect if None
    OCR_CONFIDENCE_THRESHOLD: float = 0.7
    MAX_PDF_PAGES: int = 5  # Bounds OCR time on long multi-page statements

    # Vision-LLM extraction (primary path when configured) via AWS Bedrock
    # (Claude Sonnet 4.5), with the regex/Tesseract pipeline above kept as
    # the fallback when this is unset, disabled, or the call/response
    # fails. See VisionExtractionService. AWS_ACCESS_KEY_ID is read here
    # only to decide whether to attempt vision extraction at all — the
    # boto3 client itself picks up credentials via the standard AWS
    # default credential chain (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
    # env vars), not from this setting directly.
    AWS_ACCESS_KEY_ID: str = ""
    AWS_REGION: str = "us-east-1"
    BEDROCK_MODEL_ID: str = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    VISION_EXTRACTION_ENABLED: bool = True
    # A content-dense page (e.g. a bank statement with 20+ transaction
    # lines) can take a while to structure into JSON — too short a
    # timeout just forces a fallback to the cruder regex pipeline before
    # the model would have actually succeeded.
    VISION_EXTRACTION_TIMEOUT_SECONDS: float = 150.0

    # Core API callback (extraction results are pushed back via REST rather
    # than a second queue, so the schema stays owned in one place)
    CORE_API_URL: str = "http://localhost:8080"
    INTERNAL_API_KEY: str = "dev_internal_worker_key_change_in_production"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()
