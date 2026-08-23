"""
Astra — SQLite Database Layer

Handles schema creation and all read/write operations for the audit trail.
We use Python's built-in sqlite3 (no ORM) for simplicity and zero extra
dependencies. All operations are synchronous — auditing is fire-and-forget
and does not block the main async request path.
"""

import sqlite3
import logging
from pathlib import Path
from app.db.models import AuditEvent

logger = logging.getLogger(__name__)


# ── Schema ────────────────────────────────────────────────────────────────────

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS audit_events (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id              TEXT NOT NULL UNIQUE,
    alert_name             TEXT NOT NULL,
    pod                    TEXT NOT NULL,
    namespace              TEXT NOT NULL,
    diagnosis              TEXT,
    severity               TEXT,
    tool                   TEXT,
    confidence             REAL,
    investigation_summary  TEXT,
    tool_result            TEXT,
    status                 TEXT NOT NULL DEFAULT 'started',
    created_at             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS triage_cache (
    dedup_key              TEXT PRIMARY KEY,
    last_seen              DATETIME NOT NULL
);
"""


def _get_connection(db_path: str) -> sqlite3.Connection:
    """Helper to get a SQLite connection with WAL mode and pooling settings."""
    conn = sqlite3.connect(db_path, timeout=10.0, check_same_thread=False)
    # Enable WAL mode for high-concurrency writes without locking
    conn.execute("PRAGMA journal_mode=WAL")
    # Enable memory-mapped I/O for faster reading
    conn.execute("PRAGMA mmap_size=3000000000")
    # Enable synchronous NORMAL for better write performance in WAL mode
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def initialise_database(db_path: str) -> None:
    """
    Create the SQLite database and tables if they do not already exist.
    Called once at application startup.
    """
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    with _get_connection(db_path) as conn:
        # sqlite3 executes multiple statements via executescript
        conn.executescript(CREATE_TABLE_SQL)
        conn.commit()
    logger.info(f"Audit database initialised at '{db_path}' with WAL mode enabled")


def insert_audit_event(db_path: str, event: AuditEvent) -> None:
    """
    Write a new AuditEvent row to the database.
    Uses INSERT OR REPLACE so that if the same thread_id is re-submitted
    (e.g. approved after being paused), the record is updated in place.
    """
    row = event.as_dict()
    columns = ", ".join(row.keys())
    placeholders = ", ".join("?" * len(row))

    sql = f"INSERT OR REPLACE INTO audit_events ({columns}) VALUES ({placeholders})"

    try:
        with _get_connection(db_path) as conn:
            conn.execute(sql, list(row.values()))
            conn.commit()
    except sqlite3.Error as exc:
        # Audit failures must never crash the main workflow — log and move on
        logger.error(f"Failed to write audit event for thread {event.thread_id}: {exc}")


def get_audit_events(db_path: str, limit: int = 50) -> list[dict]:
    """Fetch the most recent audit events (newest first). Used by the /history endpoint."""
    try:
        with _get_connection(db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM audit_events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(row) for row in rows]
    except sqlite3.Error as exc:
        logger.error(f"Failed to fetch audit events: {exc}")
        return []


def check_and_update_triage_cache(db_path: str, dedup_key: str, window_minutes: int) -> bool:
    """
    Checks if an alert (dedup_key) was seen within the window_minutes.
    If yes, returns True (it is a duplicate and should be suppressed).
    If no, updates the cache with the current time and returns False.
    """
    try:
        with _get_connection(db_path) as conn:
            # 1. Clean up stale entries older than the window
            conn.execute(
                "DELETE FROM triage_cache WHERE last_seen < datetime('now', ?)",
                (f"-{window_minutes} minutes",)
            )
            
            # 2. Check if our key exists
            row = conn.execute(
                "SELECT last_seen FROM triage_cache WHERE dedup_key = ?",
                (dedup_key,)
            ).fetchone()
            
            if row:
                return True
                
            # 3. If not found, insert it and return False
            conn.execute(
                "INSERT INTO triage_cache (dedup_key, last_seen) VALUES (?, datetime('now'))",
                (dedup_key,)
            )
            conn.commit()
            return False
            
    except sqlite3.Error as exc:
        logger.error(f"Failed to check triage cache: {exc}")
        # If the DB fails, fail open (allow the alert through)
        return False


