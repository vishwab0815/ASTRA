"""
Astra — API Routes

All HTTP endpoints are defined here.

Endpoints:
  POST /webhook                      → Receive a single Astra-format alert
  POST /alertmanager                 → Receive a Prometheus Alertmanager batch
  POST /threads/{thread_id}/approve  → Resume or abort a paused workflow
  GET  /history                      → View the audit trail of recent workflows

The main workflow (POST /webhook) follows this pattern:
  1. Validate the request body (Pydantic does this automatically)
  2. Start the LangGraph workflow — it pauses before the 'act' node
  3. Check the confidence score from the 'plan' node
  4. If confidence >= threshold: auto-resume → resolved
  5. If confidence <  threshold: hold → notify Slack → paused_for_approval
  6. Write the outcome to the audit trail
"""

import uuid
import logging
import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.agent.graph import astra_graph
from app.agent.state import init_state
from app.core.config import settings
from app.services.audit import record_workflow_start, record_workflow_outcome, fetch_recent_history
from app.services.slack import send_hitl_request
from app.services.alertmanager import parse_alertmanager_payload
from app.api.metrics import (
    ALERTS_RECEIVED, ALERTS_RESOLVED, ALERTS_PAUSED,
    ALERTS_APPROVED, ALERTS_REJECTED,
    CONFIDENCE_HISTOGRAM, QUEUED_WORKFLOWS,
)
from app.api.schemas import (
    AlertPayload, AlertmanagerPayload, ApproveRequest,
    WebhookResponse, ApproveResponse, AgentResult, HistoryRecord,
)

logger = logging.getLogger(__name__)

# ── API Authentication ────────────────────────────────────────────────────────
security = HTTPBearer()

def verify_api_key(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verifies the Bearer token matches the ASTRA_API_KEY from .env"""
    if credentials.credentials != settings.astra_api_key:
        logger.warning("Rejected request due to invalid API Key.")
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return credentials.credentials

# Protect all endpoints in this router
router = APIRouter(tags=["agent"], dependencies=[Depends(verify_api_key)])

# ── Concurrency Gate (Semaphore) ─────────────────────────────────────────────────
# When a large alert storm hits (e.g. 500 alerts at once), without a limiter
# every alert would simultaneously fire an LLM call, instantly hitting the
# Groq rate limit and causing all 500 to fail.
#
# asyncio.Semaphore acts like a traffic light:
#   - Only settings.max_concurrent_workflows investigations run at the same time
#   - All other background tasks wait at 'async with _workflow_semaphore:'
#   - As each investigation finishes, it releases the semaphore slot for the next one
#
# The semaphore is created lazily on first use because asyncio requires it
# to be created inside a running event loop.
_workflow_semaphore: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    """Return the module-level semaphore, creating it lazily on first call."""
    global _workflow_semaphore
    if _workflow_semaphore is None:
        _workflow_semaphore = asyncio.Semaphore(settings.max_concurrent_workflows)
    return _workflow_semaphore


# ── Helper ─────────────────────────────────────────────────────────────────────

async def _run_workflow(payload: AlertPayload, thread_id: str) -> None:
    """
    Core workflow execution — runs asynchronously as a BackgroundTask.

    Uses asyncio.to_thread() to offload the synchronous LangGraph / LLM work
    to a thread pool worker. This is critical: without this, a single 10-second
    LLM call would block the FastAPI event loop, causing Astra to stop responding
    to all other incoming webhooks during that time.

    IMPORTANT: This function must never raise an exception. Because it runs in
    a FastAPI BackgroundTask, any unhandled exception is silently swallowed
    by the framework, meaning the alert is dropped with no trace in the audit log.
    The outer try/except guarantees we always write an error record.
    """
    from app.services.triage import should_triage_suppress

    # ── Phase 1: Triage (fast, synchronous — no LLM involved) ─────────────────
    if should_triage_suppress(payload, settings.audit_db_path, window_minutes=5):
        logger.info(f"Dropping duplicate alert {payload.alert} for {payload.pod}")
        return  # Suppressed, do nothing further

    config = {"configurable": {"thread_id": thread_id}}

    logger.info(
        "Starting Astra workflow",
        extra={
            "thread_id": thread_id,
            "alert":     payload.alert,
            "pod":       payload.pod,
            "namespace": payload.namespace,
        },
    )

    # Track this alert in Prometheus
    ALERTS_RECEIVED.labels(alert_name=payload.alert, namespace=payload.namespace).inc()

    # Start audit record — created before any LLM call so it always exists
    audit_event = record_workflow_start(
        thread_id=thread_id,
        alert_name=payload.alert,
        pod=payload.pod,
        namespace=payload.namespace,
    )

    try:
        # ── Concurrency Gate: acquire a semaphore slot before calling the LLM ──────
        # If all slots are taken, this line yields control back to the event loop
        # and waits until a running investigation finishes and releases its slot.
        # The QUEUED_WORKFLOWS gauge lets engineers see the queue depth in real-time.
        QUEUED_WORKFLOWS.inc()
        async with _get_semaphore():
            QUEUED_WORKFLOWS.dec()  # We have a slot — no longer queued

            # ── Run the graph in a thread pool to avoid blocking the event loop ──
            # astra_graph.stream() is a synchronous generator that makes blocking LLM
            # network calls. asyncio.to_thread() moves it to a worker thread so
            # FastAPI can continue serving requests while the LLM is thinking.
            def _run_graph_sync() -> None:
                for _ in astra_graph.stream(init_state(payload.model_dump()), config):
                    pass

            await asyncio.to_thread(_run_graph_sync)

        snapshot   = astra_graph.get_state(config)
        values     = snapshot.values
        confidence = values.get("confidence", 0.0)

        # Record confidence in Prometheus histogram
        CONFIDENCE_HISTOGRAM.observe(confidence)

        # ── Decide: auto-resume or hold ───────────────────────────────────────
        paused_at_act = snapshot.next and "act" in snapshot.next

        if paused_at_act and confidence >= settings.confidence_threshold:
            # Confidence is sufficient — auto-resume and execute the fix
            logger.info(
                "Auto-resuming workflow",
                extra={"thread_id": thread_id, "confidence": confidence, "tool": values.get("tool")},
            )
            def _resume_graph_sync() -> None:
                for _ in astra_graph.stream(None, config):
                    pass

            await asyncio.to_thread(_resume_graph_sync)

            snapshot = astra_graph.get_state(config)
            values   = snapshot.values

            ALERTS_RESOLVED.labels(tool=values.get("tool", "unknown")).inc()
            record_workflow_outcome(audit_event, values, status="resolved")

        elif paused_at_act:
            # Confidence is too low — hold for human approval and notify Slack
            logger.warning(
                "Workflow paused — confidence below threshold",
                extra={"thread_id": thread_id, "confidence": confidence, "threshold": settings.confidence_threshold},
            )
            ALERTS_PAUSED.labels(tool=values.get("tool", "unknown")).inc()
            record_workflow_outcome(audit_event, values, status="paused")

            send_hitl_request(
                thread_id=thread_id,
                alert_name=payload.alert,
                pod=payload.pod,
                namespace=payload.namespace,
                diagnosis=values.get("diagnosis", ""),
                severity=values.get("severity", ""),
                tool=values.get("tool", ""),
                confidence=confidence,
            )

        else:
            # Graph finished without pausing (unexpected — shouldn't happen with interrupt_before)
            ALERTS_RESOLVED.labels(tool=values.get("tool", "unknown")).inc()
            record_workflow_outcome(audit_event, values, status="resolved")

    except Exception as exc:
        # ── Safety net: catch ALL failures so the audit trail is never incomplete
        # This includes LLM rate limits (429), network errors, and unexpected bugs.
        logger.error(
            "Background workflow failed — recording error in audit log",
            exc_info=True,
            extra={"thread_id": thread_id, "alert": payload.alert, "pod": payload.pod},
        )
        # Write an error record so operators can see the failure in /history
        record_workflow_outcome(audit_event, {}, status=f"error: {type(exc).__name__}: {exc}")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post(
    "/webhook",
    response_model=WebhookResponse,
    summary="Receive a Kubernetes alert and trigger the Astra self-healing workflow",
    description=(
        "Send a single alert in Astra format. "
        "The agent investigates the alert, plans a fix, and either "
        "executes it automatically (high confidence) or requests human approval (low confidence)."
    ),
)
async def receive_webhook(payload: AlertPayload, background_tasks: BackgroundTasks) -> WebhookResponse:
    thread_id = str(uuid.uuid4())
    background_tasks.add_task(_run_workflow, payload, thread_id)
    return WebhookResponse(
        status="processing",
        message="Alert received and queued for asynchronous background investigation.",
        thread_id=thread_id
    )


@router.post(
    "/alertmanager",
    response_model=list[WebhookResponse],
    summary="Receive a Prometheus Alertmanager webhook (batch format)",
    description=(
        "Accepts the standard Prometheus Alertmanager webhook body. "
        "Each firing alert in the batch gets its own Astra workflow. "
        "Configure Alertmanager to send webhooks to this URL."
    ),
)
async def receive_alertmanager(payload: AlertmanagerPayload, background_tasks: BackgroundTasks) -> list[WebhookResponse]:
    alerts = parse_alertmanager_payload(payload.model_dump())
    if not alerts:
        return []
        
    responses = []
    for alert in alerts:
        thread_id = str(uuid.uuid4())
        background_tasks.add_task(_run_workflow, alert, thread_id)
        responses.append(WebhookResponse(
            status="processing",
            message="Alert received and queued for asynchronous background investigation.",
            thread_id=thread_id
        ))
    return responses


@router.post(
    "/threads/{thread_id}/approve",
    response_model=ApproveResponse,
    summary="Resume or abort a paused workflow",
    description=(
        "When a workflow is paused due to low confidence, an operator "
        "calls this endpoint to either approve (resume and execute) or deny (abort). "
        "The thread_id comes from the original webhook response."
    ),
)
async def approve_workflow(thread_id: str, req: ApproveRequest) -> ApproveResponse:
    config   = {"configurable": {"thread_id": thread_id}}
    snapshot = astra_graph.get_state(config)

    if not snapshot or not snapshot.next:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Thread '{thread_id}' was not found or is not currently paused for approval. "
                "Possible reasons: it was already resolved or approved, it is still processing "
                "in the background (check GET /history), or the thread_id is invalid. "
                "Workflow state is persisted to 'astra_checkpoints.db' and survives server restarts."
            ),
        )

    if req.approved:
        logger.info("Operator approved workflow", extra={"thread_id": thread_id})
        def _resume_approval_sync() -> None:
            for _ in astra_graph.stream(None, config):
                pass

        await asyncio.to_thread(_resume_approval_sync)

        final  = astra_graph.get_state(config)
        values = final.values

        ALERTS_APPROVED.inc()
        ALERTS_RESOLVED.labels(tool=values.get("tool", "unknown")).inc()

        # Update audit record to resolved
        from app.db.models import AuditEvent
        from app.db.database import insert_audit_event
        from datetime import datetime, timezone

        alert_info = values.get("alert", {})
        audit_event = AuditEvent(
            thread_id=thread_id,
            alert_name=alert_info.get("alert", "Manual Approval"),
            pod=alert_info.get("pod", "unknown"),
            namespace=alert_info.get("namespace", "default"),
            diagnosis=values.get("diagnosis"),
            severity=values.get("severity"),
            tool=values.get("tool"),
            confidence=values.get("confidence"),
            investigation_summary=values.get("investigation_summary"),
            tool_result=values.get("tool_result"),
            status="resolved",
        )
        insert_audit_event(settings.audit_db_path, audit_event)

        return ApproveResponse(
            status="resumed_and_completed",
            tool_result=values.get("tool_result"),
        )

    else:
        logger.info("Operator rejected workflow", extra={"thread_id": thread_id})
        ALERTS_REJECTED.inc()

        from app.db.models import AuditEvent
        from app.db.database import insert_audit_event
        from datetime import datetime, timezone

        values = snapshot.values
        alert_info = values.get("alert", {})
        audit_event = AuditEvent(
            thread_id=thread_id,
            alert_name=alert_info.get("alert", "Manual Rejection"),
            pod=alert_info.get("pod", "unknown"),
            namespace=alert_info.get("namespace", "default"),
            diagnosis=values.get("diagnosis"),
            severity=values.get("severity"),
            tool=values.get("tool"),
            confidence=values.get("confidence"),
            investigation_summary=values.get("investigation_summary"),
            tool_result="Operator rejected proposed remediation.",
            status="aborted",
        )
        insert_audit_event(settings.audit_db_path, audit_event)

        return ApproveResponse(status="aborted")


@router.get(
    "/history",
    response_model=list[HistoryRecord],
    summary="View the audit trail of recent Astra workflow executions",
    description="Returns the 50 most recent workflow records from the SQLite audit database.",
)
async def get_history() -> list[HistoryRecord]:
    records = fetch_recent_history(limit=50)
    return [HistoryRecord(**r) for r in records]
