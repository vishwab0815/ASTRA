import pytest
from app.services.triage import extract_workload_name, should_triage_suppress
from app.api.schemas import AlertPayload
from app.db.database import initialise_database
import os
import tempfile

def test_extract_workload_name():
    # Deployment pod
    assert extract_workload_name("auth-service-745bf9d8f9-zxq2a") == "auth-service"
    # StatefulSet pod
    assert extract_workload_name("redis-cache-0") == "redis-cache"
    assert extract_workload_name("redis-cache-12") == "redis-cache"
    # DaemonSet/Job pod
    assert extract_workload_name("node-exporter-xyz12") == "node-exporter"
    # No suffix (should remain unchanged)
    assert extract_workload_name("my-custom-pod") == "my-custom-pod"

def test_should_triage_suppress():
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        db_path = tmp.name

    try:
        initialise_database(db_path)

        alert1 = AlertPayload(
            alert="PodCrashLoopBackOff",
            pod="payment-service-745bf9d8f9-abc12",
            namespace="default"
        )
        
        # First alert should NOT be suppressed
        is_suppressed = should_triage_suppress(alert1, db_path, window_minutes=5)
        assert is_suppressed is False

        # Second alert for the SAME workload (different pod) should BE suppressed
        alert2 = AlertPayload(
            alert="PodCrashLoopBackOff",
            pod="payment-service-745bf9d8f9-xyz98",
            namespace="default"
        )
        is_suppressed = should_triage_suppress(alert2, db_path, window_minutes=5)
        assert is_suppressed is True
        
        # Third alert for a DIFFERENT workload should NOT be suppressed
        alert3 = AlertPayload(
            alert="PodCrashLoopBackOff",
            pod="auth-service-54321-abcde",
            namespace="default"
        )
        is_suppressed = should_triage_suppress(alert3, db_path, window_minutes=5)
        assert is_suppressed is False

    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass
