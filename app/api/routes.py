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
from fastapi import APIRouter, HTTPException

from app.agent.graph import astra_graph
from app.agent.state import init_state
from app.core.config import settings
from app.services.audit import record_workflow_start, record_workflow_outcome, fetch_recent_history
from app.services.slack import send_hitl_request
from app.services.alertmanager import parse_alertmanager_payload
from app.api.metrics import (
    ALERTS_RECEIVED, ALERTS_RESOLVED, ALERTS_PAUSED,
    ALERTS_APPROVED, ALERTS_REJECTED,
    CONFIDENCE_HISTOGRAM,
)
from app.api.schemas import (
    AlertPayload, AlertmanagerPayload, ApproveRequest,
    WebhookResponse, ApproveResponse, AgentResult, HistoryRecord,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agent"])


# ── Helper ─────────────────────────────────────────────────────────────────────

def _run_workflow(payload: AlertPayload) -> WebhookResponse:
    """
    Core workflow execution — used by both /webhook and /alertmanager.

    Starts the LangGraph graph, waits for the HITL interrupt before 'act',
    then either auto-resumes (high confidence) or holds for human approval.
    Writes an audit record regardless of outcome.
    """
    from app.services.triage import should_triage_suppress
    
    # ── Phase 1: Triage ───────────────────────────────────────────────────────
    if should_triage_suppress(payload, settings.audit_db_path, window_minutes=5):
        logger.info(f"Dropping duplicate alert {payload.alert} for {payload.pod}")
        return WebhookResponse(
            status="suppressed_by_triage",
            message="Alert suppressed by Triage Engine because an identical incident is currently being handled.",
            thread_id="triage-suppressed",
            result=AgentResult(
                investigation_summary="Suppressed duplicate incident.",
                confidence=0.0
            )
        )

    thread_id = str(uuid.uuid4())
    config    = {"configurable": {"thread_id": thread_id}}

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

    # Start audit record
    audit_event = record_workflow_start(
        thread_id=thread_id,
        alert_name=payload.alert,
        pod=payload.pod,
        namespace=payload.namespace,
    )

    # ── Run the graph (investigate → plan → [PAUSE before act]) ──────────────
    for _ in astra_graph.stream(init_state(payload.model_dump()), config):
        pass  # Each iteration yields a node's output; we only need the final state

    snapshot   = astra_graph.get_state(config)
    values     = snapshot.values
    confidence = values.get("confidence", 0.0)

    # Record confidence in Prometheus histogram
    CONFIDENCE_HISTOGRAM.observe(confidence)

    # ── Decide: auto-resume or hold ───────────────────────────────────────────
    paused_at_act = snapshot.next and "act" in snapshot.next

    if paused_at_act and confidence >= settings.confidence_threshold:
        # Confidence is sufficient — auto-resume and execute the fix
        logger.info(
            "Auto-resuming workflow",
            extra={"thread_id": thread_id, "confidence": confidence, "tool": values.get("tool")},
        )
        for _ in astra_graph.stream(None, config):
            pass

        snapshot = astra_graph.get_state(config)
        values   = snapshot.values

        ALERTS_RESOLVED.labels(tool=values.get("tool", "unknown")).inc()
        record_workflow_outcome(audit_event, values, status="resolved")
        status  = "resolved"
        message = "Astra resolved the issue automatically."

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

        status  = "paused_for_approval"
        message = (
            f"Confidence {confidence:.0%} is below the {settings.confidence_threshold:.0%} threshold. "
            f"A Slack notification has been sent. "
            f"Call POST /threads/{thread_id}/approve to proceed or abort."
        )

    else:
        # Graph finished without pausing (unexpected — shouldn't happen with interrupt_before)
        ALERTS_RESOLVED.labels(tool=values.get("tool", "unknown")).inc()
        record_workflow_outcome(audit_event, values, status="resolved")
        status  = "resolved"
        message = "Workflow completed."

    return WebhookResponse(
        status=status,
        message=message,
        thread_id=thread_id,
        result=AgentResult(
            diagnosis=values.get("diagnosis"),
            severity=values.get("severity"),
            investigation_summary=values.get("investigation_summary"),
            action_planned=values.get("action"),
            tool=values.get("tool"),
            confidence=values.get("confidence"),
            tool_result=values.get("tool_result"),
        ),
    )


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
async def receive_webhook(payload: AlertPayload) -> WebhookResponse:
    return _run_workflow(payload)


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
async def receive_alertmanager(payload: AlertmanagerPayload) -> list[WebhookResponse]:
    alerts = parse_alertmanager_payload(payload.model_dump())
    if not alerts:
        return []
    return [_run_workflow(alert) for alert in alerts]


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
                f"Thread '{thread_id}' was not found or is not waiting for approval. "
                "It may have already been resolved, approved, or the server may have restarted "
                "(MemorySaver does not survive restarts — Phase 5 will add persistence)."
            ),
        )

    if req.approved:
        logger.info("Operator approved workflow", extra={"thread_id": thread_id})
        for _ in astra_graph.stream(None, config):
            pass

        final  = astra_graph.get_state(config)
        values = final.values

        ALERTS_APPROVED.inc()
        return ApproveResponse(
            status="resumed_and_completed",
            tool_result=values.get("tool_result"),
        )

    else:
        logger.info("Operator rejected workflow", extra={"thread_id": thread_id})
        ALERTS_REJECTED.inc()
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
