import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth ----
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=200)
    locale: Literal["ar", "en"] = "ar"

    @field_validator("password")
    @classmethod
    def strong(cls, v):
        if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
            raise ValueError("Password must contain letters and digits")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(ORM):
    id: uuid.UUID
    email: str
    full_name: str
    locale: str
    settings: dict


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)
    locale: Literal["ar", "en"] | None = None
    settings: dict | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ---- workspaces ----
class WorkspaceOut(ORM):
    id: uuid.UUID
    name: str
    owner_id: uuid.UUID
    ai_monthly_token_limit: int


class WorkspaceWithRole(WorkspaceOut):
    role: str


class WorkspaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class MemberIn(BaseModel):
    email: EmailStr
    role: Literal["admin", "editor", "viewer"] = "editor"


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    role: str


# ---- projects / folders ----
class ProjectIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    category: str = Field(default="", max_length=64)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: str | None = Field(default=None, max_length=64)
    is_archived: bool | None = None
    is_favorite: bool | None = None


class ProjectOut(ORM):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    description: str
    category: str
    is_archived: bool
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
    document_count: int = 0


class FolderIn(BaseModel):
    project_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    parent_id: uuid.UUID | None = None


class FolderOut(ORM):
    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str


# ---- documents ----
class DocumentIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None
    template_id: uuid.UUID | None = None
    template_slug: str | None = None
    title: str = Field(min_length=1, max_length=300)
    report_type: str = Field(default="academic", max_length=64)
    language: Literal["ar", "en"] = "ar"
    metadata: dict = Field(default_factory=dict)
    content: dict | None = None
    layout: dict | None = None
    id: uuid.UUID | None = None  # client-generated id (offline creation)


class DocumentUpdate(BaseModel):
    base_version: int = Field(ge=1, description="Version the client edited; mismatch -> 409 conflict")
    title: str | None = Field(default=None, min_length=1, max_length=300)
    content: dict | None = None
    layout: dict | None = None
    metadata: dict | None = None
    status: Literal["draft", "in_progress", "completed"] | None = None
    project_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None
    is_favorite: bool | None = None
    create_version: bool = False
    version_label: str = Field(default="", max_length=200)


class DocumentSummary(ORM):
    id: uuid.UUID
    workspace_id: uuid.UUID
    project_id: uuid.UUID | None
    folder_id: uuid.UUID | None
    title: str
    report_type: str
    language: str
    status: str
    is_favorite: bool
    version: int
    created_at: datetime
    updated_at: datetime
    tags: list[str] = []


class DocumentOut(DocumentSummary):
    template_id: uuid.UUID | None
    metadata: dict = Field(default_factory=dict)
    content: dict
    layout: dict


class VersionOut(ORM):
    id: uuid.UUID
    version: int
    title: str
    label: str
    created_at: datetime


class VersionDetail(VersionOut):
    content: dict
    layout: dict


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    anchor_text: str = Field(default="", max_length=2000)
    parent_id: uuid.UUID | None = None


class CommentOut(ORM):
    id: uuid.UUID
    document_id: uuid.UUID
    parent_id: uuid.UUID | None
    author_id: uuid.UUID | None
    anchor_text: str
    body: str
    resolved: bool
    created_at: datetime


class TagsIn(BaseModel):
    tags: list[str] = Field(max_length=30)


# ---- templates ----
class TemplateIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    name_ar: str = Field(default="", max_length=200)
    category: str = Field(default="custom", max_length=64)
    structure: list = Field(default_factory=list)
    layout: dict = Field(default_factory=dict)
    styles: dict = Field(default_factory=dict)


class TemplateOut(ORM):
    id: uuid.UUID
    slug: str
    name: str
    name_ar: str
    category: str
    structure: list
    layout: dict
    is_builtin: bool
    styles: dict = {}


# ---- references ----
SourceType = Literal["book", "article", "journal", "website", "thesis", "report", "conference", "other"]


class Author(BaseModel):
    given: str = Field(default="", max_length=200)
    family: str = Field(default="", max_length=200)


class SourceIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    source_type: SourceType = "article"
    title: str = Field(min_length=1, max_length=1000)
    authors: list[Author] = Field(default_factory=list, max_length=200)
    year: str = Field(default="", max_length=16)
    doi: str = Field(default="", max_length=255)
    isbn: str = Field(default="", max_length=32)
    data: dict = Field(default_factory=dict)
    cite_key: str = Field(default="", max_length=100)


class SourceOut(ORM):
    id: uuid.UUID
    workspace_id: uuid.UUID
    project_id: uuid.UUID | None
    source_type: str
    title: str
    authors: list
    year: str
    doi: str
    isbn: str
    data: dict
    cite_key: str


class ImportIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    format: Literal["bibtex", "ris"]
    text: str = Field(max_length=2_000_000)


class FormatIn(BaseModel):
    source_ids: list[uuid.UUID]
    style: Literal["apa", "ieee", "mla", "chicago", "harvard", "vancouver"] = "apa"


# ---- AI ----
class ProviderIn(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=100)
    type: Literal["openai", "openai_compatible", "ollama", "anthropic"]
    base_url: str = Field(default="", max_length=500)
    api_key: str | None = Field(default=None, max_length=500)  # None = keep existing
    model: str = Field(default="", max_length=200)
    embedding_model: str = Field(default="", max_length=200)
    is_default: bool = False
    monthly_token_limit: int = Field(default=0, ge=0)

    @field_validator("base_url")
    @classmethod
    def url(cls, v):
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("base_url must start with http:// or https://")
        return v


class ProviderOut(BaseModel):
    id: str
    name: str
    type: str
    base_url: str
    model: str
    embedding_model: str
    is_default: bool
    has_api_key: bool
    monthly_token_limit: int = 0


class AIGenerateIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    document_id: uuid.UUID | None = None
    provider_id: str | None = None
    action: str
    params: dict[str, Any] = Field(default_factory=dict)
    temperature: float = Field(default=0.4, ge=0, le=2)
    max_tokens: int = Field(default=2048, ge=16, le=16000)


class AIResearchIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    document_id: uuid.UUID | None = None
    provider_id: str | None = None
    question: str = Field(min_length=2, max_length=4000)
    asset_ids: list[uuid.UUID] = Field(default_factory=list)
    top_k: int = Field(default=6, ge=1, le=20)
    language: Literal["ar", "en"] = "ar"


class AIResult(BaseModel):
    text: str
    provider: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    sources: list[dict] = []
    retrieval: str = ""


# ---- exports ----
class ExportIn(BaseModel):
    document_id: uuid.UUID
    content: dict | None = None  # optional unsaved content (print preview of current state)
    layout: dict | None = None


# ---- sync ----
class SyncOp(BaseModel):
    client_op_id: str = Field(min_length=1, max_length=64)
    entity_type: Literal["document"]
    entity_id: uuid.UUID
    op: Literal["upsert", "delete"]
    base_version: int = Field(default=0, ge=0)
    data: dict = Field(default_factory=dict)


class SyncPushIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    device_id: str = Field(min_length=1, max_length=64)
    operations: list[SyncOp] = Field(max_length=500)


class SyncPullIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    device_id: str = Field(min_length=1, max_length=64)
    since: datetime | None = None  # server timestamp returned by the previous pull
