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

    # RabbitMQ (defaults for local dev - override in .env)
    RABBITMQ_HOST: str = "localhost"
    RABBITMQ_PORT: int = 5672
    RABBITMQ_USERNAME: str = "akihlee"
    RABBITMQ_PASSWORD: str = "dev_rabbitmq_password"
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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()
