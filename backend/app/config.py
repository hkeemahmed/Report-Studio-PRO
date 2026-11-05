"""Application settings loaded from environment variables (never hard-code secrets)."""
import os
from functools import lru_cache
from pathlib import Path


class Settings:
    def __init__(self) -> None:
        self.app_name = "Report Studio PRO"
        self.database_url = os.getenv("RSP_DATABASE_URL", "sqlite:///./storage/reportstudio.db")
        self.jwt_secret = os.getenv("RSP_JWT_SECRET", "")
        if not self.jwt_secret:
            # Dev fallback: random per-process secret (tokens invalidate on restart).
            self.jwt_secret = os.urandom(32).hex()
        self.access_token_minutes = int(os.getenv("RSP_ACCESS_TOKEN_MINUTES", "15"))
        self.refresh_token_days = int(os.getenv("RSP_REFRESH_TOKEN_DAYS", "30"))
        self.storage_dir = Path(os.getenv("RSP_STORAGE_DIR", "./storage"))
        self.cors_origins = [o for o in os.getenv("RSP_CORS_ORIGINS", "http://localhost:5173,tauri://localhost").split(",") if o]
        self.rate_limit_per_minute = int(os.getenv("RSP_RATE_LIMIT_PER_MINUTE", "120"))
        self.ai_rate_limit_per_minute = int(os.getenv("RSP_AI_RATE_LIMIT_PER_MINUTE", "20"))
        self.max_upload_mb = int(os.getenv("RSP_MAX_UPLOAD_MB", "25"))
        # Key used to encrypt AI provider API keys at rest (Fernet-like via HMAC+XOR stream, see crypto.py)
        self.secrets_key = os.getenv("RSP_SECRETS_KEY", "") or self.jwt_secret
        self.font_dir = Path(os.getenv("RSP_FONT_DIR", str(Path(__file__).parent / "exports" / "fonts")))


@lru_cache
def get_settings() -> Settings:
    return Settings()
