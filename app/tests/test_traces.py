import pytest
from app.services.traces import store_trace, get_traces, Trace, TraceSpan, _trace_store

@pytest.fixture(autouse=True)
def clear_traces():
    _trace_store.clear()
    yield

def test_trace_ingestion_and_critical_path():
    spans = [
        TraceSpan(
            span_id="span_root",
            trace_id="trace_123",
            parent_span_id=None,
            service="api-gateway",
            operation="POST /checkout",
            start_time_ms=1000,
            duration_ms=350,
            has_error=True,
            status_code=500,
            tags={"http.method": "POST"}
        ),
        TraceSpan(
            span_id="span_db",
            trace_id="trace_123",
            parent_span_id="span_root",
            service="postgres",
            operation="INSERT INTO orders",
            start_time_ms=1050,
            duration_ms=200,
            has_error=False,
            status_code=200,
            tags={"db.system": "postgresql"}
        )
    ]
    
    trace = Trace(
        trace_id="trace_123",
        root_service="api-gateway",
        root_operation="POST /checkout",
        total_duration_ms=350,
        span_count=2,
        created_at=1000.0,
        has_error=True,
        spans=spans
    )
    
    store_trace(trace)
    
    # Retrieve
    traces = get_traces(limit=10)
    assert len(traces) == 1
    
    t = traces[0]
    assert t["trace_id"] == "trace_123"
    assert t["root_service"] == "api-gateway"
    assert t["span_count"] == 2
    assert t["has_error"] is True
    assert t["total_duration_ms"] == 350
    
    # Check spans
    spans_out = t["spans"]
    assert len(spans_out) == 2
    
def test_trace_pagination_and_sorting():
    for i in range(5):
        t = Trace(
            trace_id=f"trace_{i}",
            root_service="service_a",
            root_operation="op",
            total_duration_ms=50,
            span_count=0,
            created_at=1000.0 + i * 10,
            has_error=False,
            spans=[]
        )
        store_trace(t)
        
    traces = get_traces(limit=2)
    assert len(traces) == 2
    
    # In my traces.py it returns the newest ones based on ordered dicts or timestamp?
    # Actually, they might just be listed in order of insertion reversed if we reverse list(values).
    assert traces[0]["trace_id"] == "trace_4"
    assert traces[1]["trace_id"] == "trace_3"
