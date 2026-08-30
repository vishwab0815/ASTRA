"""
Astra — OpenTelemetry Trace Store

Lightweight in-memory OTLP-compatible trace store.
In production: replace with Jaeger/Tempo backend or ClickHouse.

Stores spans grouped by trace_id and exposes them via REST API.
The topology canvas uses trace data to highlight hot paths between services.
"""

import time
import uuid
import random
from dataclasses import dataclass, field

@dataclass
class TraceSpan:
    span_id:       str
    trace_id:      str
    parent_span_id: str | None
    service:       str
    operation:     str
    start_time_ms: int          # Unix ms
    duration_ms:   float
    has_error:     bool
    status_code:   int          # HTTP/gRPC status
    tags:          dict = field(default_factory=dict)
    events:        list[dict] = field(default_factory=list)

@dataclass  
class Trace:
    trace_id:      str
    root_service:  str
    root_operation:str
    total_duration_ms: float
    has_error:     bool
    span_count:    int
    created_at:    float
    spans:         list[TraceSpan] = field(default_factory=list)


# ── In-memory trace store ──────────────────────────────────────────────────────
_trace_store: dict[str, Trace] = {}
_MAX_TRACES = 500  # rolling window

SERVICE_COLORS = {
    "ingress-nginx":       "#00f0ff",
    "auth-service":        "#818cf8",
    "payment-service":     "#f97316",
    "frontend-crash-app":  "#f2495c",
    "postgres-db":         "#a855f7",
    "redis-cache":         "#10b981",
    "kafka-broker":        "#f59e0b",
    "notification-worker": "#fbbf24",
}


def store_trace(trace: Trace) -> None:
    if len(_trace_store) >= _MAX_TRACES:
        oldest = min(_trace_store, key=lambda k: _trace_store[k].created_at)
        del _trace_store[oldest]
    _trace_store[trace.trace_id] = trace


def get_traces(limit: int = 50, service_filter: str | None = None) -> list[dict]:
    traces = sorted(_trace_store.values(), key=lambda t: -t.created_at)
    if service_filter:
        traces = [t for t in traces if t.root_service == service_filter or
                  any(s.service == service_filter for s in t.spans)]
    return [_trace_to_dict(t) for t in traces[:limit]]


def get_trace(trace_id: str) -> dict | None:
    t = _trace_store.get(trace_id)
    return _trace_to_dict(t) if t else None


def _trace_to_dict(t: Trace) -> dict:
    return {
        "trace_id":            t.trace_id,
        "root_service":        t.root_service,
        "root_operation":      t.root_operation,
        "total_duration_ms":   t.total_duration_ms,
        "has_error":           t.has_error,
        "span_count":          t.span_count,
        "created_at":          t.created_at,
        "spans": [
            {
                "span_id":        s.span_id,
                "trace_id":       s.trace_id,
                "parent_span_id": s.parent_span_id,
                "service":        s.service,
                "operation":      s.operation,
                "start_time_ms":  s.start_time_ms,
                "duration_ms":    s.duration_ms,
                "has_error":      s.has_error,
                "status_code":    s.status_code,
                "tags":           s.tags,
                "color":          SERVICE_COLORS.get(s.service, "#6b7280"),
            }
            for s in sorted(t.spans, key=lambda s: s.start_time_ms)
        ],
    }


def seed_demo_traces() -> None:
    """Seed realistic multi-service distributed traces for the waterfall view."""
    now_ms = int(time.time() * 1000)

    # ── Trace 1: Normal checkout flow ─────────────────────────────────────────
    t1_id = "trace-" + str(uuid.uuid4())[:8]
    t1 = Trace(
        trace_id=t1_id, root_service="ingress-nginx",
        root_operation="GET /api/v1/checkout",
        total_duration_ms=142.0, has_error=False, span_count=6,
        created_at=time.time() - 30,
    )
    t1_spans = [
        TraceSpan(f"s1-{t1_id}", t1_id, None,        "ingress-nginx",      "GET /api/v1/checkout", now_ms - 30000, 142.0, False, 200, {"http.method":"GET"}),
        TraceSpan(f"s2-{t1_id}", t1_id, f"s1-{t1_id}","auth-service",       "validate_token",       now_ms - 29980, 18.2,  False, 200, {"user.id":"u_8x2a"}),
        TraceSpan(f"s3-{t1_id}", t1_id, f"s2-{t1_id}","postgres-db",        "SELECT users WHERE id", now_ms - 29970, 8.1, False, 0, {"db.type":"postgresql"}),
        TraceSpan(f"s4-{t1_id}", t1_id, f"s1-{t1_id}","payment-service",    "process_payment",      now_ms - 29960, 98.0, False, 200, {"payment.provider":"stripe"}),
        TraceSpan(f"s5-{t1_id}", t1_id, f"s4-{t1_id}","redis-cache",        "GET session:8x2a",     now_ms - 29959, 5.3,  False, 0,   {"cache.hit":"true"}),
        TraceSpan(f"s6-{t1_id}", t1_id, f"s4-{t1_id}","notification-worker","send_order_confirm",   now_ms - 29860, 22.0, False, 200, {"msg.type":"email"}),
    ]
    t1.spans = t1_spans
    store_trace(t1)

    # ── Trace 2: Crashed checkout (frontend OOM) ───────────────────────────────
    t2_id = "trace-" + str(uuid.uuid4())[:8]
    t2 = Trace(
        trace_id=t2_id, root_service="ingress-nginx",
        root_operation="POST /api/v1/checkout",
        total_duration_ms=520.0, has_error=True, span_count=7,
        created_at=time.time() - 120,
    )
    t2_spans = [
        TraceSpan(f"s1-{t2_id}", t2_id, None,          "ingress-nginx",     "POST /api/v1/checkout", now_ms - 120000, 520.0, True, 502, {"http.method":"POST"}),
        TraceSpan(f"s2-{t2_id}", t2_id, f"s1-{t2_id}", "auth-service",      "validate_token",        now_ms - 119980, 21.0, False, 200, {}),
        TraceSpan(f"s3-{t2_id}", t2_id, f"s1-{t2_id}", "frontend-crash-app","render_checkout_page",  now_ms - 119958, 498.0, True, 500, {"error":"OOMKilled", "exit_code":"137"}),
        TraceSpan(f"s4-{t2_id}", t2_id, f"s3-{t2_id}", "postgres-db",       "SELECT cart items",     now_ms - 119950, 490.0, True, 0,   {"error":"connection_timeout"}),
        TraceSpan(f"s5-{t2_id}", t2_id, f"s3-{t2_id}", "redis-cache",       "GET user:session",      now_ms - 119958, 5.8,  False, 0,   {"cache.hit":"false"}),
        TraceSpan(f"s6-{t2_id}", t2_id, f"s4-{t2_id}", "payment-service",   "charge_card",           now_ms - 119900, 150.0, True, 503, {"error":"upstream_timeout"}),
        TraceSpan(f"s7-{t2_id}", t2_id, f"s6-{t2_id}", "postgres-db",       "UPDATE transactions",   now_ms - 119890, 145.0, True, 0,   {"error":"deadlock_detected"}),
    ]
    t2.spans = t2_spans
    store_trace(t2)

    # ── Trace 3: Kafka message processing ─────────────────────────────────────
    t3_id = "trace-" + str(uuid.uuid4())[:8]
    t3 = Trace(
        trace_id=t3_id, root_service="kafka-broker",
        root_operation="consume: order.created",
        total_duration_ms=88.0, has_error=False, span_count=3,
        created_at=time.time() - 60,
    )
    t3.spans = [
        TraceSpan(f"s1-{t3_id}", t3_id, None,          "kafka-broker",       "consume: order.created", now_ms - 60000, 88.0,  False, 0,   {"topic":"order.created","partition":"3"}),
        TraceSpan(f"s2-{t3_id}", t3_id, f"s1-{t3_id}", "notification-worker","process_order_event",    now_ms - 59990, 82.0,  False, 200, {}),
        TraceSpan(f"s3-{t3_id}", t3_id, f"s2-{t3_id}", "postgres-db",        "INSERT notifications",   now_ms - 59980, 12.0,  False, 0,   {"db.rows":"1"}),
    ]
    store_trace(t3)
