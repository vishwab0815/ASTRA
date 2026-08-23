"""
Astra — Agent State

AstraState is the single shared data structure that flows through
every node in the LangGraph graph. Each node reads from it and
returns a partial update — never the full state.

Adding a new field:
  1. Add it to AstraState with its type and a comment
  2. Add a default in init_state()
  3. Update any node that populates it
"""

from typing import TypedDict


class AstraState(TypedDict):
    # ── Input ─────────────────────────────────────────────────────────────────
    alert: dict             # Raw incoming alert (pod, namespace, alert name, extras)

    # ── Investigation phase (Phase 6 ReAct loop) ──────────────────────────────
    investigation_summary: str  # Evidence accumulated from diagnostic tool calls

    # ── Diagnosis (set by the investigate node) ───────────────────────────────
    diagnosis: str          # One-sentence explanation of what is wrong
    severity: str           # high | medium | low

    # ── Plan (set by the plan node) ───────────────────────────────────────────
    action: str             # Human-readable description of the remediation action
    tool: str               # Exact tool name from TOOL_REGISTRY (e.g. "restart_pod")
    confidence: float       # LLM confidence in the chosen action (0.0 – 1.0)

    # ── Act (set by the act node) ─────────────────────────────────────────────
    tool_result: str        # Output from the tool execution

    # ── Control ───────────────────────────────────────────────────────────────
    escalated: bool         # True if the workflow was paused for human approval


def init_state(alert: dict) -> AstraState:
    """
    Build the initial blank state for a new alert.
    This is the single place to set default values — update here if fields change.
    """
    return {
        "alert":                  alert,
        "investigation_summary":  "",
        "diagnosis":              "",
        "severity":               "",
        "action":                 "",
        "tool":                   "",
        "confidence":             0.0,
        "tool_result":            "",
        "escalated":              False,
    }
