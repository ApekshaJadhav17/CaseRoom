import os
from typing import Optional
from qdrant_client import QdrantClient, models

COLLECTION = "medical_knowledge"
_EMBED_MODEL = "BAAI/bge-small-en-v1.5"
_VECTOR_NAME = "fast-bge-small-en"

_client: Optional[QdrantClient] = None


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        url = os.getenv("QDRANT_URL", "")
        api_key = os.getenv("QDRANT_API_KEY", "")
        if not url:
            raise RuntimeError("QDRANT_URL is not set")
        _client = QdrantClient(url=url, api_key=api_key or None)
    return _client


def is_available() -> bool:
    url = os.getenv("QDRANT_URL", "")
    return bool(url and "your-cluster" not in url)


def search(query: str, top_k: int = 5) -> list[str]:
    """Return relevant text chunks from the medical knowledge base. Returns [] gracefully if unavailable."""
    if not is_available():
        return []
    try:
        client = get_client()
        response = client.query_points(
            collection_name=COLLECTION,
            query=models.Document(text=query, model=_EMBED_MODEL),
            using=_VECTOR_NAME,
            limit=top_k,
        )
        return [
            str((p.payload or {}).get("document", ""))
            for p in response.points
            if (p.payload or {}).get("document")
        ]
    except Exception:
        return []
