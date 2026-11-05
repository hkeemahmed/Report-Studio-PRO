from app.auth.security import decrypt_secret, encrypt_secret, hash_password, verify_password

from .conftest import make_user


def test_argon2id_hashing():
    h = hash_password("Secret123")
    assert h.startswith("$argon2id$")
    assert verify_password("Secret123", h) and not verify_password("wrong", h)


def test_secret_encryption_roundtrip():
    token = encrypt_secret("sk-test-123")
    assert "sk-test" not in token and decrypt_secret(token) == "sk-test-123"


def test_register_login_refresh_me(client):
    r = client.post("/auth/register", json={"email": "a@b.com", "password": "abc12345"})
    assert r.status_code == 201
    assert client.post("/auth/register", json={"email": "A@b.com", "password": "abc12345"}).status_code == 409
    assert client.post("/auth/login", json={"email": "a@b.com", "password": "nope1234"}).status_code == 401
    tok = client.post("/auth/login", json={"email": "a@b.com", "password": "abc12345"}).json()
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {tok['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == "a@b.com"
    new = client.post("/auth/refresh", json={"refresh_token": tok["refresh_token"]})
    assert new.status_code == 200
    # access token cannot be used as refresh token
    assert client.post("/auth/refresh", json={"refresh_token": tok["access_token"]}).status_code == 401


def test_weak_password_rejected(client):
    assert client.post("/auth/register", json={"email": "w@b.com", "password": "short"}).status_code == 422
    assert client.post("/auth/register", json={"email": "w@b.com", "password": "onlyletters"}).status_code == 422


def test_logout_all_revokes_refresh(client):
    u = make_user(client)
    assert client.post("/auth/logout-all", headers=u["headers"]).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": u["tokens"]["refresh_token"]}).status_code == 401


def test_requires_auth(client):
    assert client.get("/projects").status_code == 401
    assert client.get("/projects", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_security_headers(client):
    r = client.get("/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff" and r.headers["X-Frame-Options"] == "DENY"


def test_auth_rate_limit(client):
    codes = [client.post("/auth/login", json={"email": "x@y.com", "password": "abc12345"}).status_code for _ in range(12)]
    assert 429 in codes


def test_swagger_available(client):
    assert client.get("/docs").status_code == 200
    assert "/documents/{doc_id}" in client.get("/openapi.json").json()["paths"]
