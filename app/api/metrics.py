"""
Astra — Prometheus Metrics

Exposes an /metrics endpoint compatible with Prometheus scraping.
Grafana can connect to this to build dashboards showing:
  - Total alerts received
  - Auto-resolution rate vs escalation rate
  - Confidence score distribution
  - Investigation rounds used per alert

Usage in routes.py / services:
    from app.api.metrics import (
        ALERTS_RECEIVED, ALERTS_RESOLVED, ALERTS_PAUSED,
        CONFIDENCE_HISTOGRAM, INVESTIGATION_ROUNDS,
    )
    ALERTS_RECEIVED.labels(alert_name="PodCrashLoopBackOff").inc()

Prometheus scrape config (prometheus.yml):
    scrape_configs:
      - job_name: astra
        static_configs:
          - targets: ["localhost:8000"]
        metrics_path: /metrics
"""

from prometheus_client import Counter, Histogram, make_asgi_app
from fastapi import APIRouter

# ── Counters ──────────────────────────────────────────────────────────────────

ALERTS_RECEIVED = Counter(
    name="astra_alerts_received_total",
    documentation="Total number of alerts received via /webhook or /alertmanager",
    labelnames=["alert_name", "namespace"],
)

ALERTS_RESOLVED = Counter(
    name="astra_alerts_resolved_total",
    documentation="Alerts that were automatically resolved without human intervention",
    labelnames=["tool"],
)

ALERTS_PAUSED = Counter(
    name="astra_alerts_paused_total",
    documentation="Alerts paused because confidence was below the threshold",
    labelnames=["tool"],
)

ALERTS_APPROVED = Counter(
    name="astra_alerts_approved_total",
    documentation="Paused alerts that an operator approved and resumed",
)

ALERTS_REJECTED = Counter(
    name="astra_alerts_rejected_total",
    documentation="Paused alerts that an operator rejected and aborted",
)

# ── Histograms ────────────────────────────────────────────────────────────────

CONFIDENCE_HISTOGRAM = Histogram(
    name="astra_agent_confidence",
    documentation="Distribution of agent confidence scores across all decisions",
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0],
)

INVESTIGATION_ROUNDS = Histogram(
    name="astra_investigation_rounds",
    documentation="Number of diagnostic tool calls made per investigation",
    buckets=[1, 2, 3, 4, 5],
)

# ── ASGI app (mounted at /metrics in main.py) ─────────────────────────────────
# FastAPI mounts this as a sub-application so Prometheus can scrape it directly.
metrics_app = make_asgi_app()

# Router for the metrics path (used in main.py mount)
router = APIRouter()
