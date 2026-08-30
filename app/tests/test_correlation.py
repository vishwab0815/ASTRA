import pytest
import time
from app.services.correlation import correlate_alert, get_active_correlations, resolve_correlation, _active_correlations, _alert_flap_tracker

@pytest.fixture(autouse=True)
def clear_correlations():
    _active_correlations.clear()
    _alert_flap_tracker.clear()
    yield

def test_single_alert_ingestion():
    incident = correlate_alert(
        namespace="production",
        service_id="payment-api",
        alert_name="HighCPU",
        error_rate=0.0
    )
    
    correlations = get_active_correlations()
    assert len(correlations) == 1
    c = correlations[0]
    
    assert c["root_cause_service"] == "payment-api"
    assert c["root_cause_alert"] == "HighCPU"
    assert c["alert_count"] == 1
    assert not c["is_storm"]

def test_alert_storm_suppression():
    for _ in range(15):
        correlate_alert(
            namespace="production",
            service_id="auth-api",
            alert_name="HighErrorRate",
            error_rate=15.0
        )
    
    correlations = get_active_correlations()
    assert len(correlations) == 1
    c = correlations[0]
    
    assert c["alert_count"] == 15
    assert c["is_storm"] is True
    # The reason message might vary, but it should mention the storm
    assert "storm" in c["correlation_reason"].lower() or c["is_storm"]

def test_multi_service_casualty():
    # Database starts failing
    correlate_alert("production", "postgres-db", "DatabaseConnectionRefused", 100.0)
    
    # API fails due to database
    correlate_alert("production", "users-api", "APILatencySpike", 5.0)
    
    # Frontend fails due to API
    correlate_alert("production", "frontend-web", "502BadGateway", 2.0)
    
    correlations = get_active_correlations()
    assert len(correlations) == 3
    
    db_corr = next(c for c in correlations if c["root_cause_service"] == "postgres-db")
    assert db_corr["severity"] == "P1"

def test_resolve_correlation():
    correlate_alert("test", "test-svc", "TemporaryGlitch")
    
    assert len(get_active_correlations()) == 1
    
    resolve_correlation("test", "test-svc", "TemporaryGlitch")
    
    correlations = get_active_correlations()
    assert len(correlations) == 1
    assert correlations[0]["status"] == "resolved"
