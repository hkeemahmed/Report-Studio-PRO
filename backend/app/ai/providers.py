"""Provider Adapter Architecture. Each adapter implements chat() and embed() over HTTP.

API keys live only on the backend (encrypted in DB) — never in the web or desktop client.
New providers: subclass AIProvider and register in PROVIDER_TYPES.
"""
import time
from dataclasses import dataclass

import httpx


class AIError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


@dataclass
class ChatResult:
    text: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: int = 0


class AIProvider:
    kind = "base"

    def __init__(self, config: dict, transport: httpx.BaseTransport | None = None):
        self.config = config
        self.base_url = (config.get("base_url") or self.default_url).rstrip("/")
        self.api_key = config.get("api_key", "")
        self.model = config.get("model") or self.default_model
        self.embedding_model = config.get("embedding_model", "")
        self.timeout = float(config.get("timeout", 120))
        self._transport = transport

    default_url = ""
    default_model = ""

    def client(self) -> httpx.Client:
        return httpx.Client(timeout=self.timeout, transport=self._transport)

    def chat(self, messages: list[dict], temperature: float = 0.4, max_tokens: int = 2048) -> ChatResult:
        raise NotImplementedError

    def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    def list_models(self) -> list[str]:
        raise NotImplementedError

    def _post(self, path, payload, headers=None):
        t0 = time.monotonic()
        try:
            with self.client() as c:
                r = c.post(self.base_url + path, json=payload, headers=headers or {})
        except httpx.HTTPError as e:
            raise AIError(f"Cannot reach AI provider at {self.base_url}: {e.__class__.__name__}")
        if r.status_code >= 400:
            msg = r.text[:300]
            raise AIError(f"Provider error {r.status_code}: {msg}", 502 if r.status_code >= 500 else 400)
        return r.json(), int((time.monotonic() - t0) * 1000)


class OpenAICompatibleProvider(AIProvider):
    """OpenAI API and any OpenAI-compatible server (LM Studio, vLLM, OpenRouter, Groq...)."""
    kind = "openai"
    default_url = "https://api.openai.com/v1"
    default_model = "gpt-4o-mini"

    def _h(self):
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    def chat(self, messages, temperature=0.4, max_tokens=2048):
        data, ms = self._post("/chat/completions", {"model": self.model, "messages": messages,
                                                    "temperature": temperature, "max_tokens": max_tokens}, self._h())
        try:
            text = data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError):
            raise AIError("Malformed response from provider")
        u = data.get("usage") or {}
        return ChatResult(text, data.get("model", self.model), u.get("prompt_tokens", 0), u.get("completion_tokens", 0), ms)

    def embed(self, texts):
        if not self.embedding_model:
            raise AIError("No embedding model configured for this provider", 400)
        data, _ = self._post("/embeddings", {"model": self.embedding_model, "input": texts}, self._h())
        return [d["embedding"] for d in sorted(data["data"], key=lambda d: d["index"])]

    def list_models(self):
        try:
            with self.client() as c:
                r = c.get(self.base_url + "/models", headers=self._h())
        except httpx.HTTPError as e:
            raise AIError(f"Cannot reach provider: {e.__class__.__name__}")
        if r.status_code >= 400:
            raise AIError(f"Provider error {r.status_code}: {r.text[:200]}", 400)
        return sorted(m["id"] for m in r.json().get("data", []))


class OllamaProvider(AIProvider):
    kind = "ollama"
    default_url = "http://localhost:11434"
    default_model = "llama3.1"

    def chat(self, messages, temperature=0.4, max_tokens=2048):
        data, ms = self._post("/api/chat", {"model": self.model, "messages": messages, "stream": False,
                                            "options": {"temperature": temperature, "num_predict": max_tokens}})
        text = (data.get("message") or {}).get("content", "")
        return ChatResult(text, data.get("model", self.model), data.get("prompt_eval_count", 0), data.get("eval_count", 0), ms)

    def embed(self, texts):
        model = self.embedding_model or "nomic-embed-text"
        data, _ = self._post("/api/embed", {"model": model, "input": texts})
        return data["embeddings"]

    def list_models(self):
        try:
            with self.client() as c:
                r = c.get(self.base_url + "/api/tags")
        except httpx.HTTPError as e:
            raise AIError(f"Cannot reach Ollama at {self.base_url}: {e.__class__.__name__}")
        if r.status_code >= 400:
            raise AIError(f"Ollama error {r.status_code}", 400)
        return sorted(m["name"] for m in r.json().get("models", []))


class AnthropicProvider(AIProvider):
    kind = "anthropic"
    default_url = "https://api.anthropic.com/v1"
    default_model = "claude-sonnet-5-5"

    def _h(self):
        return {"x-api-key": self.api_key, "anthropic-version": "2023-06-01"}

    def chat(self, messages, temperature=0.4, max_tokens=2048):
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        msgs = [m for m in messages if m["role"] != "system"]
        data, ms = self._post("/messages", {"model": self.model, "system": system, "messages": msgs,
                                            "max_tokens": max_tokens, "temperature": temperature}, self._h())
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        u = data.get("usage") or {}
        return ChatResult(text, data.get("model", self.model), u.get("input_tokens", 0), u.get("output_tokens", 0), ms)

    def embed(self, texts):
        raise AIError("Anthropic does not provide an embeddings API; configure an embedding provider", 400)

    def list_models(self):
        try:
            with self.client() as c:
                r = c.get(self.base_url + "/models", headers=self._h())
        except httpx.HTTPError as e:
            raise AIError(f"Cannot reach provider: {e.__class__.__name__}")
        if r.status_code >= 400:
            raise AIError(f"Provider error {r.status_code}: {r.text[:200]}", 400)
        return [m["id"] for m in r.json().get("data", [])]


PROVIDER_TYPES = {"openai": OpenAICompatibleProvider, "openai_compatible": OpenAICompatibleProvider,
                  "ollama": OllamaProvider, "anthropic": AnthropicProvider}

# Tests can inject a transport here to exercise adapters without network.
TRANSPORT_OVERRIDE: httpx.BaseTransport | None = None


def build_provider(config: dict) -> AIProvider:
    cls = PROVIDER_TYPES.get(config.get("type", ""))
    if not cls:
        raise AIError(f"Unknown provider type: {config.get('type')}", 400)
    return cls(config, transport=TRANSPORT_OVERRIDE)
