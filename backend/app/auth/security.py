import base64
import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..config import get_settings

_ph = PasswordHasher()  # Argon2id by default


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except (VerifyMismatchError, InvalidHashError):
        return False


def _token(sub: uuid.UUID, kind: str, ttl: timedelta, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(sub), "typ": kind, "iat": now, "exp": now + ttl, "jti": uuid.uuid4().hex, **(extra or {})}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def create_access_token(user_id: uuid.UUID) -> str:
    return _token(user_id, "access", timedelta(minutes=get_settings().access_token_minutes))


def create_refresh_token(user_id: uuid.UUID, token_version: int) -> str:
    return _token(user_id, "refresh", timedelta(days=get_settings().refresh_token_days), {"tv": token_version})


def decode_token(token: str, kind: str) -> dict:
    data = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    if data.get("typ") != kind:
        raise jwt.InvalidTokenError("wrong token type")
    return data


def _key() -> bytes:
    return hashlib.sha256(get_settings().secrets_key.encode()).digest()


def encrypt_secret(plain: str) -> str:
    """AES-256-GCM encryption for API keys / backups at rest."""
    nonce = os.urandom(12)
    return base64.b64encode(nonce + AESGCM(_key()).encrypt(nonce, plain.encode(), None)).decode()


def decrypt_secret(token: str) -> str:
    raw = base64.b64decode(token)
    return AESGCM(_key()).decrypt(raw[:12], raw[12:], None).decode()


def encrypt_bytes(data: bytes) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(_key()).encrypt(nonce, data, None)


def decrypt_bytes(data: bytes) -> bytes:
    return AESGCM(_key()).decrypt(data[:12], data[12:], None)
