"""
Astra — RAG Vector Database Service

This module handles connection to the local ChromaDB instance and configures
the local HuggingFace embeddings model. This provides the memory for Astra
to search historical outages without sending proprietary data to the cloud.
"""

import os
import logging
from pathlib import Path
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

logger = logging.getLogger(__name__)

DB_DIR = os.path.join(os.getcwd(), ".chroma_db")
COLLECTION_NAME = "astra_runbooks"

_vector_store = None


def get_vector_store() -> Chroma:
    """
    Returns a singleton instance of the Chroma vector store.
    Initializes the local embedding model on first call.
    """
    global _vector_store
    if _vector_store is not None:
        return _vector_store

    logger.info(f"Initializing local Vector Database at {DB_DIR}...")
    
    # We use all-MiniLM-L6-v2 because it is extremely fast, runs locally,
    # and has excellent semantic performance for technical logs/text.
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    Path(DB_DIR).mkdir(parents=True, exist_ok=True)
    
    _vector_store = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=DB_DIR
    )
    
    return _vector_store


def search_runbooks(query: str, n_results: int = 2) -> list[str]:
    """
    Performs a semantic similarity search against historical runbooks.
    Returns the content of the most relevant documents.
    """
    try:
        store = get_vector_store()
        docs = store.similarity_search(query, k=n_results)
        
        if not docs:
            return ["No relevant historical runbooks found."]
            
        return [doc.page_content for doc in docs]
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return [f"Error searching runbooks: {e}"]
