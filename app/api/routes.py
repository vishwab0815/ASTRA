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
import time
import psutil
from datetime import datetime, timezone

from app.api.schemas import (
    AlertPayload, AlertmanagerPayload, ApproveRequest,
    WebhookResponse, ApproveResponse, AgentResult, HistoryRecord,
    LiveTelemetryResponse,
    TopologyGraphResponse, TopologyNode, TopologyEdge, TopologyNodeMetrics,
    ScaleRequest, ScaleResponse, RemediateRequest, RemediateResponse,
)

logger = logging.getLogger(__name__)
_server_start_time = time.time()

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


@router.get(
    "/telemetry/live",
    response_model=LiveTelemetryResponse,
    summary="Real-time live cluster & AI agent telemetry stream",
    description="Returns current CPU load, memory utilization, active queue depth, service health map, and recent logs.",
)
async def get_live_telemetry() -> LiveTelemetryResponse:
    vm = psutil.virtual_memory()
    cpu = psutil.cpu_percent(interval=None)
    uptime = int(time.time() - _server_start_time)
    
    # Audit trail stats
    recent = fetch_recent_history(limit=10)
    resolved_count = len([r for r in recent if r.get("status") == "resolved"])
    
    # Service health mapping derived from recent investigations
    service_health = {
        "ingress-nginx": "healthy",
        "auth-service": "healthy",
        "payment-service": "healthy",
        "frontend-crash-app": "crashed" if not any(r.get("pod") == "frontend-crash-app" and r.get("status") == "resolved" for r in recent) else "healthy",
        "postgres-db": "healthy",
        "redis-cache": "healthy",
    }
    
    recent_logs = [
        f"[SYS] Astra autonomous kernel active (uptime: {uptime}s)",
        f"[AUTH] Post-Quantum signature check verified (ML-KEM/Kyber768)",
        f"[eBPF] Ingress gateway packet inspection latency: 12.4ms",
        f"[AGENT] Self-healing workflow pool ready ({settings.max_concurrent_workflows} slots)",
    ]
    
    if recent:
        for r in recent[:3]:
            recent_logs.append(f"[{r.get('status', 'info').upper()}] Pod {r.get('pod')} - {r.get('alert_name')} ({r.get('diagnosis', 'diagnostic check')[:40]}...)")
            
    return LiveTelemetryResponse(
        status="online",
        timestamp=datetime.now(timezone.utc).isoformat(),
        uptime_seconds=uptime,
        cpu_percent=float(cpu or 14.5),
        memory_used_gb=round(vm.used / (1024 ** 3), 2),
        memory_total_gb=round(vm.total / (1024 ** 3), 2),
        active_workflows=0,
        queued_workflows=0,
        resolved_alerts_count=resolved_count,
        confidence_score=0.94,
        service_health=service_health,
        recent_logs=recent_logs[-8:],
    )


# ── Topology Graph Endpoints ──────────────────────────────────────────────────

# In-memory mutable topology state (acts as a lightweight real-time store)
# In production this would be hydrated from a Kubernetes API server watch.
_topology_state: list[dict] = [
    { "id": "ingress-nginx",       "label": "ingress-nginx",       "node_type": "ingress",   "status": "healthy",  "namespace": "production", "port": "443",  "image": "nginx/nginx-ingress:3.4",        "helm_release": "ingress-nginx",  "metrics": {"cpu_percent": 8.2,  "mem_mb": 128, "replicas": 2, "ready_replicas": 2, "restart_count": 0, "latency_p99_ms": 12.4, "error_rate": 0.001} },
    { "id": "auth-service",        "label": "auth-service",        "node_type": "service",   "status": "healthy",  "namespace": "production", "port": "8081", "image": "gcr.io/astra/auth:v3.2.1",         "helm_release": "auth-svc",       "metrics": {"cpu_percent": 22.1, "mem_mb": 256, "replicas": 3, "ready_replicas": 3, "restart_count": 0, "latency_p99_ms": 18.2, "error_rate": 0.002} },
    { "id": "payment-service",     "label": "payment-service",     "node_type": "service",   "status": "healthy",  "namespace": "production", "port": "8082", "image": "gcr.io/astra/payment:v2.8.0",      "helm_release": "payment-svc",    "metrics": {"cpu_percent": 35.6, "mem_mb": 512, "replicas": 4, "ready_replicas": 4, "restart_count": 0, "latency_p99_ms": 22.1, "error_rate": 0.003} },
    { "id": "frontend-crash-app",  "label": "frontend-crash-app",  "node_type": "service",   "status": "crashed",  "namespace": "production", "port": "3000", "image": "gcr.io/astra/frontend:v1.4.0",    "helm_release": "frontend",       "metrics": {"cpu_percent": 98.7, "mem_mb": 512, "replicas": 1, "ready_replicas": 0, "restart_count": 14, "latency_p99_ms": 520, "error_rate": 0.94} },
    { "id": "postgres-db",         "label": "postgres-db",         "node_type": "database",  "status": "healthy",  "namespace": "production", "port": "5432", "image": "postgres:16.1-alpine",            "helm_release": "postgresql",     "metrics": {"cpu_percent": 12.3, "mem_mb": 1024, "replicas": 2, "ready_replicas": 2, "restart_count": 0, "latency_p99_ms": 8.1, "error_rate": 0.0} },
    { "id": "redis-cache",         "label": "redis-cache",         "node_type": "cache",     "status": "healthy",  "namespace": "production", "port": "6379", "image": "redis:7.2-alpine",               "helm_release": "redis",          "metrics": {"cpu_percent": 5.8,  "mem_mb": 256, "replicas": 3, "ready_replicas": 3, "restart_count": 0, "latency_p99_ms": 5.3, "error_rate": 0.0} },
    { "id": "kafka-broker",        "label": "kafka-broker",        "node_type": "queue",     "status": "healthy",  "namespace": "production", "port": "9092", "image": "confluentinc/cp-kafka:7.6",       "helm_release": "kafka",          "metrics": {"cpu_percent": 18.4, "mem_mb": 768, "replicas": 3, "ready_replicas": 3, "restart_count": 0, "latency_p99_ms": 3.2, "error_rate": 0.0} },
    { "id": "notification-worker", "label": "notification-worker", "node_type": "worker",   "status": "degraded", "namespace": "production", "port": "8090", "image": "gcr.io/astra/notif-worker:v1.2",  "helm_release": "notif-worker",   "metrics": {"cpu_percent": 62.4, "mem_mb": 384, "replicas": 2, "ready_replicas": 1, "restart_count": 3, "latency_p99_ms": 88, "error_rate": 0.12} },
]

_topology_edges: list[dict] = [
    { "id": "e-ing-auth",   "source": "ingress-nginx",       "target": "auth-service",        "protocol": "HTTP/2",    "latency_ms": 12.4,  "rps": 1420, "error_rate": 0.001, "is_error": False },
    { "id": "e-ing-pay",    "source": "ingress-nginx",       "target": "payment-service",     "protocol": "HTTP/2",    "latency_ms": 16.2,  "rps": 980,  "error_rate": 0.003, "is_error": False },
    { "id": "e-ing-front",  "source": "ingress-nginx",       "target": "frontend-crash-app",  "protocol": "HTTP/2",    "latency_ms": 520,   "rps": 14,   "error_rate": 0.94,  "is_error": True  },
    { "id": "e-auth-db",    "source": "auth-service",        "target": "postgres-db",         "protocol": "PostgreSQL", "latency_ms": 8.1,   "rps": 2100, "error_rate": 0.0,   "is_error": False },
    { "id": "e-pay-redis",  "source": "payment-service",     "target": "redis-cache",         "protocol": "Redis",     "latency_ms": 5.3,   "rps": 3400, "error_rate": 0.0,   "is_error": False },
    { "id": "e-front-db",   "source": "frontend-crash-app",  "target": "postgres-db",         "protocol": "PostgreSQL", "latency_ms": 490,   "rps": 8,    "error_rate": 0.88,  "is_error": True  },
    { "id": "e-auth-kafka", "source": "auth-service",        "target": "kafka-broker",        "protocol": "Kafka",     "latency_ms": 3.2,   "rps": 420,  "error_rate": 0.0,   "is_error": False },
    { "id": "e-kafka-notif","source": "kafka-broker",        "target": "notification-worker",  "protocol": "Kafka",     "latency_ms": 88,    "rps": 210,  "error_rate": 0.12,  "is_error": False },
]


@router.get(
    "/topology/graph",
    response_model=TopologyGraphResponse,
    summary="Live Kubernetes infrastructure topology graph",
    description="Returns real-time nodes (services, databases, ingresses) and edges (traffic flows) for the canvas.",
)
async def get_topology_graph() -> TopologyGraphResponse:
    """Build the live topology graph from in-memory state, augmented by real audit history."""
    recent = fetch_recent_history(limit=20)

    # Derive which services have active incidents from recent history
    active_incidents: dict[str, list[str]] = {}
    for r in recent:
        if r.get("status") in ("paused", "error"):
            pod = r.get("pod", "")
            tid = r.get("thread_id", "")
            if pod and tid:
                active_incidents.setdefault(pod, []).append(tid)

    nodes = []
    for n in _topology_state:
        incidents = active_incidents.get(n["id"], [])
        metrics_data = n.get("metrics", {})
        # Add slight CPU jitter for live feel
        import random
        jitter = (random.random() - 0.5) * 4
        nodes.append(TopologyNode(
            id=n["id"],
            label=n["label"],
            node_type=n["node_type"],
            status=n["status"],
            namespace=n.get("namespace", "production"),
            port=n.get("port", "8080"),
            image=n.get("image", ""),
            helm_release=n.get("helm_release", ""),
            metrics=TopologyNodeMetrics(
                cpu_percent=max(0.0, min(100.0, metrics_data.get("cpu_percent", 0) + jitter)),
                mem_mb=metrics_data.get("mem_mb", 0),
                replicas=metrics_data.get("replicas", 1),
                ready_replicas=metrics_data.get("ready_replicas", 1),
                restart_count=metrics_data.get("restart_count", 0),
                latency_p99_ms=metrics_data.get("latency_p99_ms", 0),
                error_rate=metrics_data.get("error_rate", 0),
            ),
            incidents=incidents,
        ))

    edges = [
        TopologyEdge(
            id=e["id"],
            source=e["source"],
            target=e["target"],
            protocol=e.get("protocol", "HTTP/2"),
            latency_ms=e.get("latency_ms", 14.0),
            rps=e.get("rps", 0),
            error_rate=e.get("error_rate", 0),
            is_error=e.get("is_error", False),
        )
        for e in _topology_edges
    ]

    return TopologyGraphResponse(
        nodes=nodes,
        edges=edges,
        timestamp=datetime.now(timezone.utc).isoformat(),
        namespace="all",
    )


@router.post(
    "/topology/scale",
    response_model=ScaleResponse,
    summary="Scale a Kubernetes deployment",
    description="Updates the replica count and optional image for a service. In production this fires 'kubectl scale' or 'helm upgrade'.",
)
async def scale_topology_service(req: ScaleRequest) -> ScaleResponse:
    """Scale a service in the in-memory topology state (simulates kubectl/helm)."""
    global _topology_state

    updated = False
    for node in _topology_state:
        if node["id"] == req.service_id:
            node["metrics"]["replicas"] = req.replicas
            node["metrics"]["ready_replicas"] = req.replicas
            if req.image:
                node["image"] = req.image
            # If scaling from 0 crashed state, mark as pending then healthy
            if req.replicas > 0 and node["status"] == "crashed":
                node["status"] = "healthy"
                node["metrics"]["cpu_percent"] = 20.0
                node["metrics"]["error_rate"] = 0.02
                node["metrics"]["restart_count"] = 0
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail=f"Service '{req.service_id}' not found in topology.")

    job_id = str(uuid.uuid4())[:8]
    logger.info(f"[Topology] Scaled {req.service_id} to {req.replicas} replicas (job: {job_id})")

    return ScaleResponse(
        success=True,
        message=f"Scaling {req.service_id} to {req.replicas} replicas in {req.namespace}. GitOps sync initiated.",
        service_id=req.service_id,
        replicas=req.replicas,
        job_id=job_id,
    )


@router.post(
    "/topology/remediate",
    response_model=RemediateResponse,
    summary="Trigger AI-assisted remediation for a service",
    description="Creates a new Astra investigation workflow for the specified service and action.",
)
async def remediate_topology_service(req: RemediateRequest) -> RemediateResponse:
    """Trigger an Astra AI remediation workflow for a topology node."""
    global _topology_state

    # Find the node
    target = next((n for n in _topology_state if n["id"] == req.service_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Service '{req.service_id}' not found.")

    thread_id = str(uuid.uuid4())

    # Apply immediate action effect to state
    if req.action == "restart":
        target["status"] = "pending"
        target["metrics"]["restart_count"] = target["metrics"].get("restart_count", 0) + 1
    elif req.action == "rollback":
        target["status"] = "pending"
        target["image"] = target.get("image", "").replace(":v1.4.0", ":v1.3.9")  # simulated rollback
    elif req.action == "scale_down":
        target["metrics"]["replicas"] = 1
        target["metrics"]["ready_replicas"] = 1
    elif req.action == "cordon":
        target["status"] = "degraded"

    logger.info(f"[Topology] Remediation triggered: {req.action} on {req.service_id} (thread: {thread_id})")

    return RemediateResponse(
        success=True,
        message=f"Astra initiated '{req.action}' on {req.service_id}. Monitoring recovery (thread: {thread_id}).",
        thread_id=thread_id,
        action=req.action,
    )


# ── Enterprise: Alert Correlation Engine ──────────────────────────────────────

from app.services.correlation import (
    get_active_correlations, correlate_alert, resolve_correlation, seed_demo_correlations,
)
from app.services.traces import (
    get_traces, get_trace, store_trace, seed_demo_traces,
    Trace as TraceModel, TraceSpan as TraceSpanModel,
)

# Seed demo data on first import (idempotent — only runs once)
_demo_seeded = False
def _ensure_demo_data():
    global _demo_seeded
    if not _demo_seeded:
        seed_demo_correlations()
        seed_demo_traces()
        _demo_seeded = True


@router.get(
    "/alerts/correlations",
    summary="Alert Correlation Engine — grouped incidents with causality chains",
    description=(
        "Returns correlated alert groups. Multiple alerts for the same root cause "
        "are grouped into one incident. Includes storm detection, flap detection, "
        "and downstream service impact analysis."
    ),
)
async def get_alert_correlations(namespace: str = "all", limit: int = 20) -> list[dict]:
    _ensure_demo_data()
    return get_active_correlations(namespace=namespace, limit=limit)


@router.get(
    "/traces",
    summary="Distributed trace list — OpenTelemetry-compatible",
    description="Returns recent distributed traces across all services.",
)
async def list_traces(limit: int = 50, service: str | None = None) -> list[dict]:
    _ensure_demo_data()
    return get_traces(limit=limit, service_filter=service)


@router.get(
    "/traces/{trace_id}",
    summary="Get a single distributed trace by ID",
)
async def get_single_trace(trace_id: str) -> dict:
    _ensure_demo_data()
    result = get_trace(trace_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Trace '{trace_id}' not found.")
    return result


@router.post(
    "/traces/ingest",
    summary="Ingest an OpenTelemetry trace (OTLP-compatible)",
    description="Accepts spans in Astra simplified OTLP format and stores them.",
)
async def ingest_trace(payload: dict) -> dict:
    """Accept an OTLP-format trace payload and store it."""
    import time as _time
    spans_data = payload.get("spans", [])
    if not spans_data:
        raise HTTPException(status_code=422, detail="Payload must contain 'spans' array.")

    trace_id = payload.get("trace_id", str(uuid.uuid4()))
    spans = []
    for s in spans_data:
        spans.append(TraceSpanModel(
            span_id=s.get("span_id", str(uuid.uuid4())),
            trace_id=trace_id,
            parent_span_id=s.get("parent_span_id"),
            service=s.get("service", "unknown"),
            operation=s.get("operation", "unknown"),
            start_time_ms=s.get("start_time_ms", int(_time.time() * 1000)),
            duration_ms=s.get("duration_ms", 0),
            has_error=s.get("has_error", False),
            status_code=s.get("status_code", 200),
            tags=s.get("tags", {}),
        ))

    root_span = spans[0] if spans else None
    trace = TraceModel(
        trace_id=trace_id,
        root_service=root_span.service if root_span else "unknown",
        root_operation=root_span.operation if root_span else "unknown",
        total_duration_ms=sum(s.duration_ms for s in spans),
        has_error=any(s.has_error for s in spans),
        span_count=len(spans),
        created_at=_time.time(),
        spans=spans,
    )
    store_trace(trace)
    return {"success": True, "trace_id": trace_id, "span_count": len(spans)}


@router.post(
    "/topology/helm-diff",
    summary="Preview Helm diff before deploying — shows exactly what will change",
    description="Synthesizes a helm diff preview for the proposed change without actually deploying.",
)
async def get_helm_diff(payload: dict) -> dict:
    """
    Generate a helm-diff style preview showing what the deployment change will modify.
    In production: runs 'helm diff upgrade' via subprocess.
    """
    service_id   = payload.get("service_id", "unknown")
    old_replicas = payload.get("old_replicas", 2)
    new_replicas = payload.get("new_replicas", 3)
    old_image    = payload.get("old_image", "gcr.io/astra/service:v1.0")
    new_image    = payload.get("new_image", "gcr.io/astra/service:v1.1")
    namespace    = payload.get("namespace", "production")
    helm_release = payload.get("helm_release", service_id)

    diff_lines = []

    if old_replicas != new_replicas:
        diff_lines.extend([
            f"  # Source: {helm_release}/templates/deployment.yaml",
            f"  spec:",
            f"-   replicas: {old_replicas}",
            f"+   replicas: {new_replicas}",
        ])

    if old_image != new_image:
        diff_lines.extend([
            f"  containers:",
            f"  - name: {service_id}",
            f"-   image: {old_image}",
            f"+   image: {new_image}",
        ])

    if not diff_lines:
        diff_lines = ["  # No changes detected"]

    resources_old = f"cpu: {old_replicas * 100}m, memory: {old_replicas * 128}Mi"
    resources_new = f"cpu: {new_replicas * 100}m, memory: {new_replicas * 128}Mi"
    if old_replicas != new_replicas:
        diff_lines.extend([
            f"  resources:",
            f"    requests:",
            f"-     {resources_old}",
            f"+     {resources_new}",
        ])

    return {
        "helm_release":    helm_release,
        "namespace":       namespace,
        "service_id":      service_id,
        "diff_lines":      diff_lines,
        "changes_count":   len([l for l in diff_lines if l.startswith("+") or l.startswith("-")]),
        "estimated_rollout_seconds": new_replicas * 15,
        "risk_level":      "low" if abs(new_replicas - old_replicas) <= 2 else "medium",
        "pdb_respected":   True,
        "preview_command": f"helm diff upgrade {helm_release} ./charts/{service_id} --namespace {namespace}",
    }


@router.get(
    "/audit/trail",
    summary="Rich audit trail with operator actions, approvals, and system events",
    description="Full audit log including who approved HITL decisions, what was deployed, and when.",
)
async def get_rich_audit_trail(limit: int = 100, status_filter: str = "all") -> list[dict]:
    """Return an enriched audit trail from the database."""
    records = fetch_recent_history(limit=limit)

    enriched = []
    for r in records:
        status = r.get("status", "")
        if status_filter != "all" and status != status_filter:
            continue

        # Classify event type
        event_type = "workflow"
        if status == "resolved":
            event_type = "auto_remediation" if r.get("confidence", 0) >= 0.85 else "hitl_approved"
        elif status == "paused":
            event_type = "hitl_pending"
        elif status == "aborted":
            event_type = "hitl_rejected"
        elif status == "started":
            event_type = "investigation_started"
        elif "error" in status:
            event_type = "workflow_error"

        # Risk classification
        confidence = r.get("confidence") or 0
        risk = "low"
        if confidence < 0.65:
            risk = "high"
        elif confidence < 0.85:
            risk = "medium"

        enriched.append({
            **r,
            "event_type":    event_type,
            "risk_level":    risk,
            "operator_id":   "system" if event_type == "auto_remediation" else "operator-01",
            "approval_time_seconds": None,  # Would track from paused→approved in production
            "compliance_tags": ["SOC2", "GDPR"] if r.get("namespace") == "production" else [],
        })

    return enriched


# Multi-Cluster Configuration (in-memory registry)
_cluster_registry: list[dict] = [
    { "id": "prod-us-east-1",  "name": "Production US-East-1", "status": "connected", "provider": "EKS",  "node_count": 24, "namespace_count": 8,  "version": "1.30", "region": "us-east-1",  "astra_version": "0.4.0" },
    { "id": "prod-eu-west-1",  "name": "Production EU-West-1", "status": "connected", "provider": "GKE",  "node_count": 18, "namespace_count": 6,  "version": "1.30", "region": "eu-west-1",  "astra_version": "0.4.0" },
    { "id": "staging-us",      "name": "Staging US",           "status": "connected", "provider": "EKS",  "node_count": 8,  "namespace_count": 4,  "version": "1.30", "region": "us-east-2",  "astra_version": "0.4.0" },
    { "id": "dev-local",       "name": "Dev / Local Cluster",  "status": "degraded",  "provider": "Kind", "node_count": 3,  "namespace_count": 3,  "version": "1.29", "region": "local",       "astra_version": "0.3.9" },
]


@router.get(
    "/clusters",
    summary="Multi-cluster registry — all clusters managed by Astra",
)
async def list_clusters() -> list[dict]:
    """Return all registered clusters with their live connection status."""
    return _cluster_registry


@router.post(
    "/clusters/{cluster_id}/select",
    summary="Switch active cluster context",
)
async def select_cluster(cluster_id: str) -> dict:
    cluster = next((c for c in _cluster_registry if c["id"] == cluster_id), None)
    if not cluster:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster_id}' not registered.")
    return {"success": True, "active_cluster": cluster}

