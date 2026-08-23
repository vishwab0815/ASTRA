"""
Astra — Test Suite
Tests AI reasoning correctness WITHOUT hitting the real LLM.
Every test mocks the LLM — runs fast, free, and offline.

Run: pytest tests/ -v
"""

import json
import pytest
import app.agent.nodes as nodes_module
from unittest.mock import MagicMock

from app.agent.graph import astra_graph
from app.agent.state import init_state
from app.agent.nodes import safe_json_parse


# ── Mock LLM fixtures ─────────────────────────────────────────────────────────

DIAGNOSE_RESPONSES = {
    "PodCrashLoopBackOff": {
        "diagnosis":        "Container is repeatedly crashing due to OOM or misconfigured env",
        "severity":         "high",
        "root_cause":       "OutOfMemoryError — container killed by OOM killer",
        "suggested_action": "restart_pod",
    },
    "HighCPUUsage": {
        "diagnosis":        "Pod is consuming excessive CPU resources beyond defined limits",
        "severity":         "medium",
        "root_cause":       "Application under heavy load or unbounded goroutine growth",
        "suggested_action": "scale_resources",
    },
    "ImagePullError": {
        "diagnosis":        "Container image cannot be pulled from the configured registry",
        "severity":         "high",
        "root_cause":       "Invalid image tag or missing registry credentials",
        "suggested_action": "check_image",
    },
}

PLAN_RESPONSES = {
    "restart_pod": {
        "action":     "Trigger rolling restart to clear crash state",
        "tool":       "restart_pod",
        "reason":     "Restarting clears the OOM state and allows clean initialisation",
        "confidence": 0.88,
    },
    "scale_resources": {
        "action":     "Increase memory and CPU limits to reduce throttling",
        "tool":       "scale_resources",
        "reason":     "Higher limits prevent throttling under current load",
        "confidence": 0.82,
    },
    "check_image": {
        "action":     "Verify image tag and registry credentials",
        "tool":       "check_image",
        "reason":     "ErrImagePull means the runtime cannot locate the image",
        "confidence": 0.91,
    },
}

PLAN_RESPONSES_LOW_CONFIDENCE = {
    "restart_pod": {**PLAN_RESPONSES["restart_pod"], "confidence": 0.50},
}

VALID_TOOLS = {"restart_pod", "scale_resources", "check_image", "get_logs"}


def _inject_mock_llm(alert_type: str, low_confidence: bool = False) -> None:
    suggested = DIAGNOSE_RESPONSES[alert_type]["suggested_action"]

    # The investigate node makes 2 LLM calls:
    #   Round 1: LLM calls get_logs to gather evidence
    #   Round 2: LLM concludes the investigation with a diagnosis
    gather_msg = MagicMock()
    gather_msg.content = json.dumps({
        "action": "gather_evidence",
        "tool":   "get_logs",
        "reason": "Check for OOM or crash signals in the logs",
    })

    conclude_msg = MagicMock()
    conclude_msg.content = json.dumps({
        "action":           "conclude",
        "diagnosis":        DIAGNOSE_RESPONSES[alert_type]["diagnosis"],
        "severity":         DIAGNOSE_RESPONSES[alert_type]["severity"],
        "root_cause":       DIAGNOSE_RESPONSES[alert_type]["root_cause"],
        "suggested_action": suggested,
    })

    plan_data = PLAN_RESPONSES_LOW_CONFIDENCE if low_confidence else PLAN_RESPONSES
    plan_msg  = MagicMock()
    plan_msg.content = json.dumps(plan_data[suggested])

    mock = MagicMock()
    # investigate node: 2 calls (gather → conclude); plan node: 1 call
    mock.invoke.side_effect = [gather_msg, conclude_msg, plan_msg]
    nodes_module._llm = mock


def _run_graph(alert: dict, alert_type: str, thread_id: str, low_confidence: bool = False) -> dict:
    """Run the full graph including auto-resume after the HITL interrupt."""
    _inject_mock_llm(alert_type, low_confidence=low_confidence)
    config = {"configurable": {"thread_id": thread_id}}

    for _ in astra_graph.stream(init_state(alert), config):
        pass

    snapshot = astra_graph.get_state(config)
    if snapshot.next and "act" in snapshot.next:
        for _ in astra_graph.stream(None, config):
            pass

    return astra_graph.get_state(config).values


# ── Alert fixtures ─────────────────────────────────────────────────────────────

CRASH_ALERT = {"alert": "PodCrashLoopBackOff", "pod": "auth-service",    "namespace": "default"}
CPU_ALERT   = {"alert": "HighCPUUsage",         "pod": "payment-service", "namespace": "production", "cpu_usage": "95%"}
IMAGE_ALERT = {"alert": "ImagePullError",        "pod": "frontend-app",   "namespace": "staging"}


# ══════════════════════════════════════════════════════════════════════════════
# TestCrashLoopBackOff
# ══════════════════════════════════════════════════════════════════════════════

class TestCrashLoopBackOff:

    def test_diagnosis_mentions_crash_or_memory(self, thread_id):
        result = _run_graph(CRASH_ALERT, "PodCrashLoopBackOff", thread_id)
        assert any(k in result["diagnosis"].lower() for k in ["crash", "memory", "oom", "kill"])

    def test_severity_is_high(self, thread_id):
        result = _run_graph(CRASH_ALERT, "PodCrashLoopBackOff", thread_id)
        assert result["severity"] == "high"

    def test_tool_is_restart_pod(self, thread_id):
        result = _run_graph(CRASH_ALERT, "PodCrashLoopBackOff", thread_id)
        assert result["tool"] == "restart_pod", f"Expected 'restart_pod', got '{result['tool']}'"

    def test_tool_result_confirms_restart_on_correct_pod(self, thread_id):
        result = _run_graph(CRASH_ALERT, "PodCrashLoopBackOff", thread_id)
        assert "restart"      in result["tool_result"].lower()
        assert "auth-service" in result["tool_result"]

    def test_confidence_within_valid_range(self, thread_id):
        result = _run_graph(CRASH_ALERT, "PodCrashLoopBackOff", thread_id)
        assert 0.0 <= result["confidence"] <= 1.0


# ══════════════════════════════════════════════════════════════════════════════
# TestHighCPUUsage
# ══════════════════════════════════════════════════════════════════════════════

class TestHighCPUUsage:

    def test_diagnosis_mentions_cpu_or_resource(self, thread_id):
        result = _run_graph(CPU_ALERT, "HighCPUUsage", thread_id)
        assert any(k in result["diagnosis"].lower() for k in ["cpu", "resource", "load", "limit", "throttl"])

    def test_severity_is_medium(self, thread_id):
        result = _run_graph(CPU_ALERT, "HighCPUUsage", thread_id)
        assert result["severity"] == "medium"

    def test_tool_is_scale_resources(self, thread_id):
        result = _run_graph(CPU_ALERT, "HighCPUUsage", thread_id)
        assert result["tool"] == "scale_resources", f"Expected 'scale_resources', got '{result['tool']}'"

    def test_tool_result_mentions_correct_pod(self, thread_id):
        result = _run_graph(CPU_ALERT, "HighCPUUsage", thread_id)
        assert "payment-service" in result["tool_result"]


# ══════════════════════════════════════════════════════════════════════════════
# TestImagePullError
# ══════════════════════════════════════════════════════════════════════════════

class TestImagePullError:

    def test_diagnosis_mentions_image_or_registry(self, thread_id):
        result = _run_graph(IMAGE_ALERT, "ImagePullError", thread_id)
        assert any(k in result["diagnosis"].lower() for k in ["image", "registry", "pull", "tag", "credential"])

    def test_severity_is_high(self, thread_id):
        result = _run_graph(IMAGE_ALERT, "ImagePullError", thread_id)
        assert result["severity"] == "high"

    def test_tool_is_check_image(self, thread_id):
        result = _run_graph(IMAGE_ALERT, "ImagePullError", thread_id)
        assert result["tool"] == "check_image", f"Expected 'check_image', got '{result['tool']}'"

    def test_tool_result_flags_image_issue(self, thread_id):
        result = _run_graph(IMAGE_ALERT, "ImagePullError", thread_id)
        assert any(k in result["tool_result"].lower() for k in ["image", "pull", "err", "registry"])


# ══════════════════════════════════════════════════════════════════════════════
# TestStateIntegrity
# ══════════════════════════════════════════════════════════════════════════════

class TestStateIntegrity:

    def test_all_output_fields_populated(self, thread_id):
        result = _run_graph(CRASH_ALERT, "PodCrashLoopBackOff", thread_id)
        # escalated is False by default (not empty string) so exclude from empty check
        skip   = {"escalated"}
        empty  = [k for k, v in result.items() if k not in skip and (v == "" or v is None)]
        assert not empty, f"Empty fields after graph run: {empty}"

    def test_tool_is_a_known_registry_name(self, thread_id):
        result = _run_graph(CRASH_ALERT, "PodCrashLoopBackOff", thread_id)
        assert result["tool"] in VALID_TOOLS, f"tool='{result['tool']}' is not in TOOL_REGISTRY"

    def test_original_alert_preserved(self, thread_id):
        result = _run_graph(CRASH_ALERT, "PodCrashLoopBackOff", thread_id)
        assert result["alert"]["pod"] == CRASH_ALERT["pod"]
        assert result["alert"]["namespace"] == CRASH_ALERT["namespace"]

    def test_init_state_schema(self):
        state = init_state({"alert": "test"})
        assert state["tool"]                   == ""
        assert state["confidence"]             == 0.0
        assert state["diagnosis"]              == ""
        assert state["investigation_summary"]  == ""
        assert state["escalated"]              is False

    def test_all_three_alerts_complete_without_exception(self, thread_id):
        _run_graph(CRASH_ALERT, "PodCrashLoopBackOff", thread_id + "-1")
        _run_graph(CPU_ALERT,   "HighCPUUsage",         thread_id + "-2")
        _run_graph(IMAGE_ALERT, "ImagePullError",        thread_id + "-3")

    def test_low_confidence_graph_still_pauses(self, thread_id):
        """When confidence is below threshold, the graph should pause at 'act'."""
        _inject_mock_llm("PodCrashLoopBackOff", low_confidence=True)
        config = {"configurable": {"thread_id": thread_id}}
        for _ in astra_graph.stream(init_state(CRASH_ALERT), config):
            pass
        snapshot = astra_graph.get_state(config)
        # Graph must be paused — next node is 'act' and tool_result is still empty
        assert "act" in (snapshot.next or [])
        assert snapshot.values.get("confidence", 1.0) < 0.75


# ══════════════════════════════════════════════════════════════════════════════
# TestSafeJsonParse
# ══════════════════════════════════════════════════════════════════════════════

class TestSafeJsonParse:

    def test_parses_clean_json(self):
        result = safe_json_parse('{"tool": "restart_pod", "confidence": 0.9}')
        assert result["tool"] == "restart_pod"

    def test_parses_json_with_markdown_fences(self):
        raw    = '```json\n{"tool": "scale_resources"}\n```'
        result = safe_json_parse(raw)
        assert result["tool"] == "scale_resources"

    def test_parses_json_buried_in_prose(self):
        raw    = 'Here is the result: {"tool": "check_image", "confidence": 0.85} done.'
        result = safe_json_parse(raw)
        assert result["tool"] == "check_image"

    def test_raises_on_truly_malformed_content(self):
        with pytest.raises(ValueError, match="safe_json_parse"):
            safe_json_parse("this is not json at all")
