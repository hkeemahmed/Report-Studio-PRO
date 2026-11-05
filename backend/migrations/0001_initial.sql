-- 0001_initial.sql — Report Studio PRO core schema (22 tables)
-- Generated from app/models; edit models then regenerate.

CREATE TABLE users (
	id UUID NOT NULL, 
	email VARCHAR(320) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	full_name VARCHAR(200) NOT NULL, 
	locale VARCHAR(8) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	token_version INTEGER NOT NULL, 
	settings JSONB NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (email)
);

CREATE TABLE workspaces (
	id UUID NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	owner_id UUID NOT NULL, 
	ai_providers JSONB NOT NULL, 
	ai_monthly_token_limit INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX ix_workspaces_owner_id ON workspaces (owner_id);

CREATE TABLE activity_logs (
	id UUID NOT NULL, 
	workspace_id UUID, 
	user_id UUID, 
	action VARCHAR(64) NOT NULL, 
	entity_type VARCHAR(32) NOT NULL, 
	entity_id VARCHAR(64) NOT NULL, 
	details JSONB NOT NULL, 
	ip VARCHAR(64) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_activity_logs_created_at ON activity_logs (created_at);
CREATE INDEX ix_activity_logs_user_id ON activity_logs (user_id);
CREATE INDEX ix_activity_logs_workspace_id ON activity_logs (workspace_id);

CREATE TABLE projects (
	id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	description TEXT NOT NULL, 
	category VARCHAR(64) NOT NULL, 
	is_archived BOOLEAN NOT NULL, 
	is_favorite BOOLEAN NOT NULL, 
	created_by UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_projects_created_by ON projects (created_by);
CREATE INDEX ix_projects_workspace_id ON projects (workspace_id);

CREATE TABLE subscriptions (
	id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	plan VARCHAR(32) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	current_period_end TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);
CREATE INDEX ix_subscriptions_workspace_id ON subscriptions (workspace_id);

CREATE TABLE sync_operations (
	id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	user_id UUID, 
	device_id VARCHAR(64) NOT NULL, 
	client_op_id VARCHAR(64) NOT NULL, 
	entity_type VARCHAR(32) NOT NULL, 
	entity_id UUID NOT NULL, 
	op VARCHAR(16) NOT NULL, 
	base_version INTEGER NOT NULL, 
	result VARCHAR(16) NOT NULL, 
	server_seq INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (device_id, client_op_id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_sync_operations_server_seq ON sync_operations (server_seq);
CREATE INDEX ix_sync_operations_user_id ON sync_operations (user_id);
CREATE INDEX ix_sync_operations_workspace_id ON sync_operations (workspace_id);

CREATE TABLE tags (
	id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	name VARCHAR(64) NOT NULL, 
	color VARCHAR(16) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (workspace_id, name), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);
CREATE INDEX ix_tags_workspace_id ON tags (workspace_id);

CREATE TABLE templates (
	id UUID NOT NULL, 
	workspace_id UUID, 
	slug VARCHAR(100) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	name_ar VARCHAR(200) NOT NULL, 
	category VARCHAR(64) NOT NULL, 
	structure JSONB NOT NULL, 
	layout JSONB NOT NULL, 
	is_builtin BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);
CREATE INDEX ix_templates_category ON templates (category);
CREATE INDEX ix_templates_slug ON templates (slug);
CREATE INDEX ix_templates_workspace_id ON templates (workspace_id);

CREATE TABLE workspace_members (
	id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	role VARCHAR(16) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (workspace_id, user_id), 
	CONSTRAINT ck_member_role CHECK (role in ('owner','admin','editor','viewer')), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX ix_workspace_members_user_id ON workspace_members (user_id);
CREATE INDEX ix_workspace_members_workspace_id ON workspace_members (workspace_id);

CREATE TABLE bibliographic_sources (
	id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	project_id UUID, 
	source_type VARCHAR(32) NOT NULL, 
	title VARCHAR(1000) NOT NULL, 
	authors JSONB NOT NULL, 
	year VARCHAR(16) NOT NULL, 
	data JSONB NOT NULL, 
	doi VARCHAR(255) NOT NULL, 
	isbn VARCHAR(32) NOT NULL, 
	cite_key VARCHAR(100) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE SET NULL
);
CREATE INDEX ix_bibliographic_sources_doi ON bibliographic_sources (doi);
CREATE INDEX ix_bibliographic_sources_project_id ON bibliographic_sources (project_id);
CREATE INDEX ix_bibliographic_sources_workspace_id ON bibliographic_sources (workspace_id);

CREATE TABLE folders (
	id UUID NOT NULL, 
	project_id UUID NOT NULL, 
	parent_id UUID, 
	name VARCHAR(200) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(parent_id) REFERENCES folders (id) ON DELETE CASCADE
);
CREATE INDEX ix_folders_parent_id ON folders (parent_id);
CREATE INDEX ix_folders_project_id ON folders (project_id);

CREATE TABLE template_styles (
	id UUID NOT NULL, 
	template_id UUID NOT NULL, 
	style_key VARCHAR(64) NOT NULL, 
	props JSONB NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (template_id, style_key), 
	FOREIGN KEY(template_id) REFERENCES templates (id) ON DELETE CASCADE
);
CREATE INDEX ix_template_styles_template_id ON template_styles (template_id);

CREATE TABLE documents (
	id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	project_id UUID, 
	folder_id UUID, 
	template_id UUID, 
	title VARCHAR(300) NOT NULL, 
	report_type VARCHAR(64) NOT NULL, 
	language VARCHAR(8) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	is_favorite BOOLEAN NOT NULL, 
	metadata JSONB NOT NULL, 
	content JSONB NOT NULL, 
	layout JSONB NOT NULL, 
	plain_text TEXT NOT NULL, 
	version INTEGER NOT NULL, 
	created_by UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_doc_status CHECK (status in ('draft','in_progress','completed')), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE SET NULL, 
	FOREIGN KEY(folder_id) REFERENCES folders (id) ON DELETE SET NULL, 
	FOREIGN KEY(template_id) REFERENCES templates (id) ON DELETE SET NULL, 
	FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_documents_created_by ON documents (created_by);
CREATE INDEX ix_documents_folder_id ON documents (folder_id);
CREATE INDEX ix_documents_project_id ON documents (project_id);
CREATE INDEX ix_documents_template_id ON documents (template_id);
CREATE INDEX ix_documents_workspace_id ON documents (workspace_id);
CREATE INDEX ix_documents_ws_updated ON documents (workspace_id, updated_at);

CREATE TABLE ai_requests (
	id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	user_id UUID, 
	document_id UUID, 
	provider VARCHAR(64) NOT NULL, 
	model VARCHAR(128) NOT NULL, 
	action VARCHAR(64) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	error TEXT NOT NULL, 
	latency_ms INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE SET NULL
);
CREATE INDEX ix_ai_requests_created_at ON ai_requests (created_at);
CREATE INDEX ix_ai_requests_document_id ON ai_requests (document_id);
CREATE INDEX ix_ai_requests_user_id ON ai_requests (user_id);
CREATE INDEX ix_ai_requests_workspace_id ON ai_requests (workspace_id);

CREATE TABLE assets (
	id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	document_id UUID, 
	kind VARCHAR(32) NOT NULL, 
	filename VARCHAR(300) NOT NULL, 
	mime_type VARCHAR(128) NOT NULL, 
	size_bytes INTEGER NOT NULL, 
	sha256 VARCHAR(64) NOT NULL, 
	storage_key VARCHAR(500) NOT NULL, 
	extracted_text TEXT NOT NULL, 
	chunks JSONB NOT NULL, 
	uploaded_by UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE SET NULL, 
	FOREIGN KEY(uploaded_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_assets_document_id ON assets (document_id);
CREATE INDEX ix_assets_sha256 ON assets (sha256);
CREATE INDEX ix_assets_uploaded_by ON assets (uploaded_by);
CREATE INDEX ix_assets_workspace_id ON assets (workspace_id);

CREATE TABLE citations (
	id UUID NOT NULL, 
	document_id UUID NOT NULL, 
	source_id UUID NOT NULL, 
	locator VARCHAR(64) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE, 
	FOREIGN KEY(source_id) REFERENCES bibliographic_sources (id) ON DELETE CASCADE
);
CREATE INDEX ix_citations_document_id ON citations (document_id);
CREATE INDEX ix_citations_source_id ON citations (source_id);

CREATE TABLE comments (
	id UUID NOT NULL, 
	document_id UUID NOT NULL, 
	parent_id UUID, 
	author_id UUID, 
	anchor_text TEXT NOT NULL, 
	body TEXT NOT NULL, 
	resolved BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE, 
	FOREIGN KEY(parent_id) REFERENCES comments (id) ON DELETE CASCADE, 
	FOREIGN KEY(author_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_comments_author_id ON comments (author_id);
CREATE INDEX ix_comments_document_id ON comments (document_id);
CREATE INDEX ix_comments_parent_id ON comments (parent_id);

CREATE TABLE document_sections (
	id UUID NOT NULL, 
	document_id UUID NOT NULL, 
	position INTEGER NOT NULL, 
	level INTEGER NOT NULL, 
	heading VARCHAR(500) NOT NULL, 
	anchor VARCHAR(64) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE
);
CREATE INDEX ix_document_sections_document_id ON document_sections (document_id);

CREATE TABLE document_tags (
	document_id UUID NOT NULL, 
	tag_id UUID NOT NULL, 
	PRIMARY KEY (document_id, tag_id), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE, 
	FOREIGN KEY(tag_id) REFERENCES tags (id) ON DELETE CASCADE
);

CREATE TABLE document_versions (
	id UUID NOT NULL, 
	document_id UUID NOT NULL, 
	version INTEGER NOT NULL, 
	title VARCHAR(300) NOT NULL, 
	content JSONB NOT NULL, 
	layout JSONB NOT NULL, 
	label VARCHAR(200) NOT NULL, 
	created_by UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (document_id, version), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_document_versions_created_by ON document_versions (created_by);
CREATE INDEX ix_document_versions_document_id ON document_versions (document_id);

CREATE TABLE exports (
	id UUID NOT NULL, 
	document_id UUID NOT NULL, 
	user_id UUID, 
	format VARCHAR(16) NOT NULL, 
	document_version INTEGER NOT NULL, 
	size_bytes INTEGER NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_exports_document_id ON exports (document_id);
CREATE INDEX ix_exports_user_id ON exports (user_id);

CREATE TABLE ai_usage (
	id UUID NOT NULL, 
	request_id UUID NOT NULL, 
	workspace_id UUID NOT NULL, 
	period VARCHAR(7) NOT NULL, 
	prompt_tokens INTEGER NOT NULL, 
	completion_tokens INTEGER NOT NULL, 
	cost_usd FLOAT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(request_id) REFERENCES ai_requests (id) ON DELETE CASCADE, 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);
CREATE INDEX ix_ai_usage_request_id ON ai_usage (request_id);
CREATE INDEX ix_ai_usage_workspace_id ON ai_usage (workspace_id);
CREATE INDEX ix_ai_usage_ws_period ON ai_usage (workspace_id, period);
