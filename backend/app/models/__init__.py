"""All 22 database tables. Portable between PostgreSQL (JSONB/UUID) and SQLite."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer,
                        String, Text, UniqueConstraint, Uuid)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def now() -> datetime:
    return datetime.now(timezone.utc)


def pk():
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def fk(target: str, nullable=False, ondelete="CASCADE"):
    return mapped_column(Uuid, ForeignKey(target, ondelete=ondelete), nullable=nullable, index=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), default="")
    locale: Mapped[str] = mapped_column(String(8), default="ar")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)  # bump to revoke all refresh tokens
    settings: Mapped[dict] = mapped_column(JSONType, default=dict)


class Workspace(TimestampMixin, Base):
    __tablename__ = "workspaces"
    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_id: Mapped[uuid.UUID] = fk("users.id")
    ai_providers: Mapped[list] = mapped_column(JSONType, default=list)  # api keys stored encrypted
    ai_monthly_token_limit: Mapped[int] = mapped_column(Integer, default=0)  # 0 = unlimited


class WorkspaceMember(TimestampMixin, Base):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),
                      CheckConstraint("role in ('owner','admin','editor','viewer')", name="ck_member_role"))
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    user_id: Mapped[uuid.UUID] = fk("users.id")
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="editor")


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(64), default="")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID] = fk("users.id", nullable=True, ondelete="SET NULL")


class Folder(TimestampMixin, Base):
    __tablename__ = "folders"
    id: Mapped[uuid.UUID] = pk()
    project_id: Mapped[uuid.UUID] = fk("projects.id")
    parent_id: Mapped[uuid.UUID | None] = fk("folders.id", nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)


class Document(TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (CheckConstraint("status in ('draft','in_progress','completed')", name="ck_doc_status"),
                      Index("ix_documents_ws_updated", "workspace_id", "updated_at"))
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    project_id: Mapped[uuid.UUID | None] = fk("projects.id", nullable=True, ondelete="SET NULL")
    folder_id: Mapped[uuid.UUID | None] = fk("folders.id", nullable=True, ondelete="SET NULL")
    template_id: Mapped[uuid.UUID | None] = fk("templates.id", nullable=True, ondelete="SET NULL")
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    report_type: Mapped[str] = mapped_column(String(64), default="academic")
    language: Mapped[str] = mapped_column(String(8), default="ar")
    status: Mapped[str] = mapped_column(String(16), default="draft")
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONType, default=dict)  # author, university...
    content: Mapped[dict] = mapped_column(JSONType, default=dict)  # Tiptap/ProseMirror JSON
    layout: Mapped[dict] = mapped_column(JSONType, default=dict)  # page layout, separate from content
    plain_text: Mapped[str] = mapped_column(Text, default="")  # for full text search
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_by: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version"),)
    id: Mapped[uuid.UUID] = pk()
    document_id: Mapped[uuid.UUID] = fk("documents.id")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(300))
    content: Mapped[dict] = mapped_column(JSONType)
    layout: Mapped[dict] = mapped_column(JSONType, default=dict)
    label: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class DocumentSection(Base):
    __tablename__ = "document_sections"
    id: Mapped[uuid.UUID] = pk()
    document_id: Mapped[uuid.UUID] = fk("documents.id")
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1)
    heading: Mapped[str] = mapped_column(String(500))
    anchor: Mapped[str] = mapped_column(String(64), default="")


class Template(TimestampMixin, Base):
    __tablename__ = "templates"
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID | None] = fk("workspaces.id", nullable=True)  # NULL = built-in
    slug: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str] = mapped_column(String(200))
    name_ar: Mapped[str] = mapped_column(String(200), default="")
    category: Mapped[str] = mapped_column(String(64), index=True)
    structure: Mapped[list] = mapped_column(JSONType, default=list)  # default sections
    layout: Mapped[dict] = mapped_column(JSONType, default=dict)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)


class TemplateStyle(Base):
    __tablename__ = "template_styles"
    __table_args__ = (UniqueConstraint("template_id", "style_key"),)
    id: Mapped[uuid.UUID] = pk()
    template_id: Mapped[uuid.UUID] = fk("templates.id")
    style_key: Mapped[str] = mapped_column(String(64))  # heading1, body, caption, cover, table...
    props: Mapped[dict] = mapped_column(JSONType, default=dict)


class Asset(TimestampMixin, Base):
    __tablename__ = "assets"
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    document_id: Mapped[uuid.UUID | None] = fk("documents.id", nullable=True, ondelete="SET NULL")
    kind: Mapped[str] = mapped_column(String(32))  # image, source_pdf, source_docx, ...
    filename: Mapped[str] = mapped_column(String(300))
    mime_type: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    storage_key: Mapped[str] = mapped_column(String(500))
    extracted_text: Mapped[str] = mapped_column(Text, default="")
    chunks: Mapped[list] = mapped_column(JSONType, default=list)  # RAG chunks [{text, embedding}]
    uploaded_by: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")


class BibliographicSource(TimestampMixin, Base):
    __tablename__ = "bibliographic_sources"
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    project_id: Mapped[uuid.UUID | None] = fk("projects.id", nullable=True, ondelete="SET NULL")
    source_type: Mapped[str] = mapped_column(String(32))  # book, article, website, thesis, journal, report
    title: Mapped[str] = mapped_column(String(1000))
    authors: Mapped[list] = mapped_column(JSONType, default=list)  # [{given, family}]
    year: Mapped[str] = mapped_column(String(16), default="")
    data: Mapped[dict] = mapped_column(JSONType, default=dict)  # journal, volume, pages, publisher, url...
    doi: Mapped[str] = mapped_column(String(255), default="", index=True)
    isbn: Mapped[str] = mapped_column(String(32), default="")
    cite_key: Mapped[str] = mapped_column(String(100), default="")


class Citation(Base):
    __tablename__ = "citations"
    id: Mapped[uuid.UUID] = pk()
    document_id: Mapped[uuid.UUID] = fk("documents.id")
    source_id: Mapped[uuid.UUID] = fk("bibliographic_sources.id")
    locator: Mapped[str] = mapped_column(String(64), default="")  # page number etc.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Comment(TimestampMixin, Base):
    __tablename__ = "comments"
    id: Mapped[uuid.UUID] = pk()
    document_id: Mapped[uuid.UUID] = fk("documents.id")
    parent_id: Mapped[uuid.UUID | None] = fk("comments.id", nullable=True)
    author_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    anchor_text: Mapped[str] = mapped_column(Text, default="")
    body: Mapped[str] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)


class AIRequest(Base):
    __tablename__ = "ai_requests"
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    document_id: Mapped[uuid.UUID | None] = fk("documents.id", nullable=True, ondelete="SET NULL")
    provider: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))  # ok / error
    error: Mapped[str] = mapped_column(Text, default="")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class AIUsage(Base):
    __tablename__ = "ai_usage"
    __table_args__ = (Index("ix_ai_usage_ws_period", "workspace_id", "period"),)
    id: Mapped[uuid.UUID] = pk()
    request_id: Mapped[uuid.UUID] = fk("ai_requests.id")
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    period: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)


class Export(Base):
    __tablename__ = "exports"
    id: Mapped[uuid.UUID] = pk()
    document_id: Mapped[uuid.UUID] = fk("documents.id")
    user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    format: Mapped[str] = mapped_column(String(16))
    document_version: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="done")  # queued / running / done / error
    storage_key: Mapped[str] = mapped_column(String(500), default="")
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("workspace_id", "name"),)
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    name: Mapped[str] = mapped_column(String(64))
    color: Mapped[str] = mapped_column(String(16), default="#3b82f6")


class DocumentTag(Base):
    __tablename__ = "document_tags"
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID | None] = fk("workspaces.id", nullable=True)
    user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    action: Mapped[str] = mapped_column(String(64))
    entity_type: Mapped[str] = mapped_column(String(32), default="")
    entity_id: Mapped[str] = mapped_column(String(64), default="")
    details: Mapped[dict] = mapped_column(JSONType, default=dict)
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Subscription(TimestampMixin, Base):
    __tablename__ = "subscriptions"
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    plan: Mapped[str] = mapped_column(String(32), default="free")
    status: Mapped[str] = mapped_column(String(16), default="active")
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SyncOperation(Base):
    __tablename__ = "sync_operations"
    __table_args__ = (UniqueConstraint("device_id", "client_op_id"),)
    id: Mapped[uuid.UUID] = pk()
    workspace_id: Mapped[uuid.UUID] = fk("workspaces.id")
    user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    device_id: Mapped[str] = mapped_column(String(64))
    client_op_id: Mapped[str] = mapped_column(String(64))
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    op: Mapped[str] = mapped_column(String(16))  # upsert / delete
    base_version: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[str] = mapped_column(String(16))  # applied / conflict / duplicate
    server_seq: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
