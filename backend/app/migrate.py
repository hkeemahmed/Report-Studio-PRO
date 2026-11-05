"""Minimal SQL migration runner: applies backend/migrations/*.sql in order, once, each in a transaction.
Usage:  python -m app.migrate            (uses RSP_DATABASE_URL)"""
import sys
from pathlib import Path

from sqlalchemy import text

from .db import Base, get_engine

DIR = Path(__file__).resolve().parent.parent / "migrations"
OPTIONAL = {"0003_pgvector.sql"}


def run(engine=None) -> list[str]:
    engine = engine or get_engine()
    applied_now = []
    if engine.dialect.name != "postgresql":
        import app.models  # noqa: F401
        Base.metadata.create_all(engine)  # SQLite (desktop/offline) uses the ORM schema directly
        return ["sqlite:create_all"]
    with engine.begin() as c:
        c.execute(text("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())"))
        done = {r[0] for r in c.execute(text("SELECT name FROM schema_migrations"))}
    for f in sorted(DIR.glob("*.sql")):
        if f.name in done:
            continue
        sql = f.read_text(encoding="utf-8")
        try:
            with engine.begin() as c:
                c.exec_driver_sql(sql)
                c.execute(text("INSERT INTO schema_migrations(name) VALUES (:n)"), {"n": f.name})
            applied_now.append(f.name)
        except Exception as e:
            if f.name in OPTIONAL:
                print(f"WARNING: skipped optional migration {f.name}: {str(e).splitlines()[0]}", file=sys.stderr)
                continue
            raise
    return applied_now


if __name__ == "__main__":
    print("applied:", run())
