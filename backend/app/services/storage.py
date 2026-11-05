"""File storage abstraction: local filesystem (default) or S3-compatible (MinIO, R2, AWS)."""
import os
import re
from pathlib import Path

from ..config import get_settings


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if not re.match(r"^[A-Za-z0-9/_.-]+$", key) or ".." in key:
            raise ValueError("Invalid storage key")
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise ValueError("Invalid storage key")
        return p

    def put(self, key: str, data: bytes) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, p)  # atomic

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        p = self._path(key)
        if p.exists():
            p.unlink()


class S3Storage:
    def __init__(self):
        import boto3  # optional dependency
        self.bucket = os.environ["RSP_S3_BUCKET"]
        self.s3 = boto3.client("s3", endpoint_url=os.getenv("RSP_S3_ENDPOINT") or None,
                               aws_access_key_id=os.getenv("RSP_S3_ACCESS_KEY"),
                               aws_secret_access_key=os.getenv("RSP_S3_SECRET_KEY"),
                               region_name=os.getenv("RSP_S3_REGION", "us-east-1"))

    def put(self, key, data):
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data)

    def get(self, key):
        return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def delete(self, key):
        self.s3.delete_object(Bucket=self.bucket, Key=key)


_storage = None


def get_storage():
    global _storage
    if _storage is None:
        _storage = S3Storage() if os.getenv("RSP_STORAGE_BACKEND") == "s3" else LocalStorage(get_settings().storage_dir / "files")
    return _storage


def reset_storage():
    global _storage
    _storage = None
