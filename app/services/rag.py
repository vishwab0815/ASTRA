"""
Astra — RAG (Retrieval-Augmented Generation) Vector Database Service

Gives Astra a long-term memory of company-specific runbooks, past incident
post-mortems, and Kubernetes troubleshooting guides.

When the LLM calls 'search_company_runbooks' during an investigation,
this service performs a semantic similarity search against the vector store
and returns the most relevant historical context.

Architecture:
  - Storage   : ChromaDB (local, on-disk at .chroma_db/)
  - Embeddings: all-MiniLM-L6-v2 (runs locally, no cloud calls, GDPR-safe)
  - Interface : search_runbooks(query) -> list[str]
  - Seeding   : Run scripts/seed_runbooks.py to load runbooks into the DB

Why local embeddings?
  Enterprise customers (banks, hospitals, defence) cannot send their internal
  runbook text to an external embedding API (OpenAI, Cohere, etc.) due to
  data privacy regulations. all-MiniLM-L6-v2 runs entirely on-device with
  excellent semantic performance for technical text.

Adding new runbooks:
  Option 1: Add markdown files to scripts/runbooks/ and re-run seed_runbooks.py
  Option 2: POST to /runbooks (future endpoint) to add documents at runtime
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
DB_DIR          = os.path.join(os.getcwd(), ".chroma_db")
COLLECTION_NAME = "astra_runbooks"

# ── Lazy singletons ───────────────────────────────────────────────────────────
# Both the embedding model and the vector store are expensive to initialise.
# We use module-level singletons so they are only created once per process.
_embeddings    = None
_vector_store  = None


def _get_embeddings():
    """
    Load the local HuggingFace embedding model (lazy, singleton).

    all-MiniLM-L6-v2 is a 22MB model that is fast, accurate for technical text,
    and runs entirely on CPU — no GPU required.
    """
    global _embeddings
    if _embeddings is not None:
        return _embeddings

    from langchain_huggingface import HuggingFaceEmbeddings

    logger.info("Loading local embedding model (all-MiniLM-L6-v2)...")
    _embeddings = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2",
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
    logger.info("Embedding model loaded successfully.")
    return _embeddings


def get_vector_store():
    """
    Return the ChromaDB vector store (lazy, singleton).

    Creates the .chroma_db/ directory on first use. The store persists to disk
    so runbooks survive server restarts — no re-seeding needed on every boot.
    """
    global _vector_store
    if _vector_store is not None:
        return _vector_store

    from langchain_chroma import Chroma

    logger.info(f"Connecting to local Vector Database at '{DB_DIR}'...")
    Path(DB_DIR).mkdir(parents=True, exist_ok=True)

    _vector_store = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=_get_embeddings(),
        persist_directory=DB_DIR,
    )

    count = _vector_store._collection.count()
    logger.info(f"Vector database ready. Documents in store: {count}")
    if count == 0:
        logger.warning(
            "Vector database is empty — no runbooks loaded. "
            "Run 'python scripts/seed_runbooks.py' to populate it."
        )

    return _vector_store


def search_runbooks(query: str, n_results: int = 3) -> list[str]:
    """
    Perform a semantic similarity search against the runbook vector store.

    Args:
        query:     A short description of the problem (e.g. 'OOMKilled Java heap').
        n_results: Number of top matching documents to return (default: 3).

    Returns:
        A list of matching runbook content strings, or a helpful message if
        the store is empty or an error occurs.
    """
    try:
        store = get_vector_store()

        # If the store is empty, return early with a clear message
        if store._collection.count() == 0:
            return [
                "The runbook database is empty. "
                "Run 'python scripts/seed_runbooks.py' to load company runbooks."
            ]

        docs = store.similarity_search(query, k=n_results)

        if not docs:
            return ["No relevant historical runbooks found for this query."]

        # Include the document's source metadata in the result so the LLM
        # can tell the operator which runbook it referenced
        results = []
        for doc in docs:
            source = doc.metadata.get("source", "Unknown runbook")
            title  = doc.metadata.get("title",  "Untitled")
            results.append(f"[Source: {title} | {source}]\n{doc.page_content}")

        return results

    except Exception as exc:
        logger.error(f"Vector search failed: {exc}", exc_info=True)
        return [f"Runbook search unavailable due to an error: {exc}"]


def ingest_document(content: str, metadata: dict) -> bool:
    """
    Add a single document to the vector store.

    Used by the seed script and the future /runbooks ingestion endpoint.

    Args:
        content:  The raw text content of the runbook or incident post-mortem.
        metadata: Dict with keys like 'source', 'title', 'date'.

    Returns:
        True if ingested successfully, False otherwise.
    """
    from langchain_core.documents import Document

    try:
        store = get_vector_store()
        doc   = Document(page_content=content, metadata=metadata)
        store.add_documents([doc])
        logger.info(
            "Runbook ingested into vector store",
            extra={"title": metadata.get("title"), "source": metadata.get("source")},
        )
        return True
    except Exception as exc:
        logger.error(f"Failed to ingest document: {exc}", exc_info=True)
        return False
