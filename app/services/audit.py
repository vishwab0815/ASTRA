"""
Astra — Audit Service

A thin wrapper around the database layer.
Routes.py calls these functions instead of touching the DB directly,
keeping the API layer clean and the DB logic in one place.
"""

import logging
from app.db.database import insert_audit_event, get_audit_events
from app.db.models import AuditEvent
from app.core.config import settings

logger = logging.getLogger(__name__)


def record_workflow_start(
    thread_id: str,
    alert_name: str,
    pod: str,
    namespace: str,
) -> AuditEvent:
    """
    Create and persist an AuditEvent at the moment a webhook is received.
    Returns the event object so the caller can update it as the workflow progresses.
    """
    event = AuditEvent(
        thread_id=thread_id,
        alert_name=alert_name,
        pod=pod,
        namespace=namespace,
        status="started",
    )
    insert_audit_event(settings.audit_db_path, event)
    return event


def record_workflow_outcome(event: AuditEvent, final_state: dict, status: str) -> None:
    """
    Update the AuditEvent with the agent's final decision and persist it.
    Called after the graph completes or is paused.
    """
    event.diagnosis             = final_state.get("diagnosis", "")
    event.severity              = final_state.get("severity", "")
    event.tool                  = final_state.get("tool", "")
    event.confidence            = final_state.get("confidence", 0.0)
    event.investigation_summary = final_state.get("investigation_summary", "")
    event.tool_result           = final_state.get("tool_result", "")
    event.status                = status

    insert_audit_event(settings.audit_db_path, event)
    logger.info(
        "Audit event recorded",
        extra={"thread_id": event.thread_id, "status": status, "tool": event.tool},
    )


def fetch_recent_history(limit: int = 50) -> list[dict]:
    """Retrieve the most recent workflow records for the /history endpoint."""
    return get_audit_events(settings.audit_db_path, limit=limit)
