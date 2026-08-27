import json
import pytest
import os
import tempfile
import uuid
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.db.database import initialise_database
from app.api.metrics import ALERTS_RECEIVED
from tests.test_phase1 import _inject_mock_llm

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_db():
    """Create a temporary SQLite database for each test to avoid state bleeding."""
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        db_path = tmp.name

    old_db_path = settings.audit_db_path
    settings.audit_db_path = db_path
    initialise_database(db_path)

    yield db_path

    settings.audit_db_path = old_db_path
    try:
        os.unlink(db_path)
    except OSError:
        pass


@pytest.fixture
def valid_headers():
    return {"Authorization": f"Bearer {settings.astra_api_key}"}


def test_auth_boundary_missing_token():
    response = client.post("/webhook", json={
        "alert": "PodCrashLoopBackOff",
        "pod": "auth-service-123",
        "namespace": "default"
    })
    assert response.status_code in (401, 403) # FastAPI HTTPBearer returns 403 when missing, but may be 401 depending on setup


def test_auth_boundary_invalid_token():
    response = client.post("/webhook", headers={"Authorization": "Bearer invalid_key"}, json={
        "alert": "PodCrashLoopBackOff",
        "pod": "auth-service-123",
        "namespace": "default"
    })
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid API Key"


def test_webhook_happy_path_auto_execute(valid_headers):
    # Mock LLM to return high confidence (auto-execute)
    _inject_mock_llm("PodCrashLoopBackOff", low_confidence=False)

    payload = {
        "alert": "PodCrashLoopBackOff",
        "pod": f"payment-service-{uuid.uuid4().hex[:8]}", # Unique pod to avoid suppression
        "namespace": "default"
    }

    # The API enqueues the background task and returns 200 immediately
    response = client.post("/webhook", headers=valid_headers, json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processing"
    assert "thread_id" in data

    # The background task will run. Wait slightly or just verify history.
    # Since TestClient background tasks run immediately/synchronously in standard FastAPI TestClient (or we wait for it if we use asyncio)
    # Actually, Starlette's TestClient runs BackgroundTasks *after* returning the response but synchronously within the context of the request if we don't mock it, but wait, `asyncio.to_thread` is used.
    # We might need to wait for the background thread to finish to verify history.
    import time
    time.sleep(0.5)

    history_resp = client.get("/history", headers=valid_headers)
    assert history_resp.status_code == 200
    history = history_resp.json()
    
    # Verify the workflow was recorded as resolved (high confidence)
    record = next((r for r in history if r["thread_id"] == data["thread_id"]), None)
    assert record is not None
    assert record["status"] == "resolved"


def test_webhook_triage_deduplication(valid_headers):
    pod_name = f"spam-service-{uuid.uuid4().hex[:8]}"
    payload = {
        "alert": "HighCPUUsage",
        "pod": pod_name,
        "namespace": "default"
    }

    # Send first alert
    response1 = client.post("/webhook", headers=valid_headers, json=payload)
    assert response1.status_code == 200
    
    # Send duplicate alert immediately
    response2 = client.post("/webhook", headers=valid_headers, json=payload)
    assert response2.status_code == 200
    
    import time
    time.sleep(0.5)

    history_resp = client.get("/history", headers=valid_headers)
    history = history_resp.json()
    
    # The first one should be in history, the second one should NOT trigger a new workflow.
    # Wait, the history record only tracks workflow *starts*. The second one is dropped before `record_workflow_start`.
    records = [r for r in history if r["pod"] == pod_name]
    assert len(records) == 1


def test_webhook_hitl_and_approve(valid_headers):
    # Mock LLM to return low confidence (pauses for approval)
    _inject_mock_llm("PodCrashLoopBackOff", low_confidence=True)

    payload = {
        "alert": "PodCrashLoopBackOff",
        "pod": f"frontend-app-{uuid.uuid4().hex[:8]}",
        "namespace": "default"
    }

    response = client.post("/webhook", headers=valid_headers, json=payload)
    assert response.status_code == 200
    thread_id = response.json()["thread_id"]

    import time
    time.sleep(0.5)

    history_resp = client.get("/history", headers=valid_headers)
    history = history_resp.json()
    record = next((r for r in history if r["thread_id"] == thread_id), None)
    assert record is not None
    assert record["status"] == "paused"

    # Now approve it
    approve_resp = client.post(f"/threads/{thread_id}/approve", headers=valid_headers, json={"approved": True})
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "resumed_and_completed"

    # Verify history updated
    history_resp2 = client.get("/history", headers=valid_headers)
    record2 = next((r for r in history_resp2.json() if r["thread_id"] == thread_id), None)
    assert record2["status"] == "resolved"


def test_webhook_hitl_and_reject(valid_headers):
    # Mock LLM to return low confidence (pauses for approval)
    _inject_mock_llm("PodCrashLoopBackOff", low_confidence=True)

    payload = {
        "alert": "PodCrashLoopBackOff",
        "pod": f"frontend-app-{uuid.uuid4().hex[:8]}",
        "namespace": "default"
    }

    response = client.post("/webhook", headers=valid_headers, json=payload)
    thread_id = response.json()["thread_id"]

    import time
    time.sleep(0.5)

    # Reject it
    reject_resp = client.post(f"/threads/{thread_id}/approve", headers=valid_headers, json={"approved": False})
    assert reject_resp.status_code == 200
    assert reject_resp.json()["status"] == "aborted"

    history_resp2 = client.get("/history", headers=valid_headers)
    record2 = next((r for r in history_resp2.json() if r["thread_id"] == thread_id), None)
    assert record2["status"] == "aborted"


def test_alertmanager_batch(valid_headers):
    _inject_mock_llm("HighCPUUsage", low_confidence=False)
    
    payload = {
        "receiver": "astra-aiops",
        "status": "firing",
        "alerts": [
            {
                "status": "firing",
                "labels": {
                    "alertname": "HighCPUUsage",
                    "pod": f"batch-pod-1-{uuid.uuid4().hex[:8]}",
                    "namespace": "default"
                },
                "annotations": {}
            },
            {
                "status": "firing",
                "labels": {
                    "alertname": "HighCPUUsage",
                    "pod": f"batch-pod-2-{uuid.uuid4().hex[:8]}",
                    "namespace": "default"
                },
                "annotations": {}
            }
        ]
    }
    
    response = client.post("/alertmanager", headers=valid_headers, json=payload)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    
    import time
    time.sleep(0.5)
    
    history_resp = client.get("/history", headers=valid_headers)
    history = history_resp.json()
    
    t1, t2 = data[0]["thread_id"], data[1]["thread_id"]
    r1 = next((r for r in history if r["thread_id"] == t1), None)
    r2 = next((r for r in history if r["thread_id"] == t2), None)
    
    assert r1 is not None
    assert r2 is not None
