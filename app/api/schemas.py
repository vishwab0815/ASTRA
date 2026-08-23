"""
Astra — API Request & Response Schemas

All public API contracts are defined here as Pydantic models.
FastAPI uses these for:
  - Input validation (rejects malformed requests before they reach the agent)
  - Automatic Swagger/OpenAPI documentation at /docs
  - Type-safe response serialisation

Adding a new endpoint:
  1. Define an inbound model (if the endpoint has a request body)
  2. Define an outbound model
  3. Use them as type annotations in routes.py
"""

from pydantic import BaseModel, Field
from typing import Optional


# ── Inbound Schemas ───────────────────────────────────────────────────────────

class AlertPayload(BaseModel):
    """
    Standard Astra alert body — used by the /webhook endpoint.
    Any extra fields (cpu_usage, image, etc.) are passed through to the agent.
    """
    alert:     str = Field(..., description="Alert name, e.g. PodCrashLoopBackOff")
    pod:       str = Field(..., description="Name of the affected Kubernetes pod")
    namespace: str = Field(default="default", description="Kubernetes namespace")

    model_config = {
        "extra": "allow",  # Accept and forward any extra fields from the alert source
        "json_schema_extra": {
            "example": {
                "alert":     "PodCrashLoopBackOff",
                "pod":       "auth-service",
                "namespace": "production",
                "restart_count": 7,
            }
        },
    }


class AlertmanagerPayload(BaseModel):
    """
    Prometheus Alertmanager webhook body.
    Used by the /alertmanager endpoint — Astra parses this into AlertPayloads internally.

    Reference: https://prometheus.io/docs/alerting/latest/configuration/#webhook_config
    """
    version:  str  = Field(default="4")
    status:   str  = Field(..., description="firing | resolved")
    alerts:   list = Field(default_factory=list)

    model_config = {"extra": "allow"}


class ApproveRequest(BaseModel):
    """Body for the /threads/{thread_id}/approve endpoint."""
    approved: bool = Field(
        ...,
        description="True to resume and execute the planned action; False to abort"
    )


# ── Outbound Schemas ──────────────────────────────────────────────────────────

class AgentResult(BaseModel):
    """The agent's decision and action outcome, embedded in webhook responses."""
    diagnosis:             Optional[str]   = None
    severity:              Optional[str]   = None
    investigation_summary: Optional[str]   = None
    action_planned:        Optional[str]   = None
    tool:                  Optional[str]   = None
    confidence:            Optional[float] = None
    tool_result:           Optional[str]   = None


class WebhookResponse(BaseModel):
    """Response returned by the /webhook and /alertmanager endpoints."""
    status:    str         = Field(..., description="resolved | paused_for_approval")
    message:   str         = Field(..., description="Human-readable explanation of the status")
    thread_id: str         = Field(..., description="Use this ID to approve/deny a paused workflow")
    result:    AgentResult


class ApproveResponse(BaseModel):
    """Response returned by the /threads/{thread_id}/approve endpoint."""
    status:      str           = Field(..., description="resumed_and_completed | aborted")
    tool_result: Optional[str] = None


class HistoryRecord(BaseModel):
    """One row from the audit trail, returned by the /history endpoint."""
    thread_id:              str
    alert_name:             str
    pod:                    str
    namespace:              str
    diagnosis:              Optional[str]   = None
    severity:               Optional[str]   = None
    tool:                   Optional[str]   = None
    confidence:             Optional[float] = None
    investigation_summary:  Optional[str]   = None
    tool_result:            Optional[str]   = None
    status:                 str
    created_at:             str


class HealthResponse(BaseModel):
    """Response for the /health endpoint."""
    status:  str = "healthy"
    version: str = "0.4.0"
