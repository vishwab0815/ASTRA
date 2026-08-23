"""
conftest.py — shared pytest fixtures for the Astra test suite.

Key concern: the compiled astra_graph uses a MemorySaver checkpointer.
If tests share thread_ids, the second test sees stale state from the first.
This fixture provides a unique thread_id per test to guarantee isolation.
"""

import pytest
import uuid


@pytest.fixture
def thread_id() -> str:
    """Return a fresh UUID thread_id for every test function."""
    return str(uuid.uuid4())
