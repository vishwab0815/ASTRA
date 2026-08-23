"""
Astra — Audit Event Model

AuditEvent is a plain Python dataclass (no ORM needed) representing
one complete record of an agent decision from alert intake to final outcome.
Every webhook execution produces exactly one AuditEvent written to SQLite.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class AuditEvent:
    """
    A complete record of one Astra workflow execution.

    Fields are populated progressively as the workflow runs:
      - thread_id, alert_*, created_at   → set when the webhook is received
      - diagnosis, severity, tool,
        confidence, investigation_summary → set after investigate + plan nodes
      - tool_result                      → set after the act node
      - status                           → updated at each stage
    """

    # Identity
    thread_id: str

    # Alert context
    alert_name: str
    pod: str
    namespace: str

    # Agent decision
    diagnosis: str          = ""
    severity: str           = ""
    tool: str               = ""
    confidence: float       = 0.0
    investigation_summary: str = ""

    # Outcome
    tool_result: str        = ""
    status: str             = "started"   # started | resolved | paused | approved | rejected

    # Timestamp (UTC)
    created_at: datetime    = field(default_factory=lambda: datetime.now(timezone.utc))

    def as_dict(self) -> dict:
        """Return a plain dict for SQLite insertion."""
        return {
            "thread_id":              self.thread_id,
            "alert_name":             self.alert_name,
            "pod":                    self.pod,
            "namespace":              self.namespace,
            "diagnosis":              self.diagnosis,
            "severity":               self.severity,
            "tool":                   self.tool,
            "confidence":             self.confidence,
            "investigation_summary":  self.investigation_summary,
            "tool_result":            self.tool_result,
            "status":                 self.status,
            "created_at":             self.created_at.isoformat(),
        }
