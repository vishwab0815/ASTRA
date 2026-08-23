"""
Astra — Agent Graph (Phase 6)

Defines the LangGraph workflow that powers Astra's self-healing logic.

Flow:
  investigate → plan → ── [interrupt_before act] ──► act → END
                                    ↑
                        API layer decides:
                        confidence >= threshold? auto-resume
                        confidence <  threshold? hold for human

The graph is compiled once at module load and reused for every request.
The MemorySaver checkpointer stores workflow state in memory keyed by
thread_id, enabling the HITL pause-and-resume pattern.

Adding new nodes:
  1. Define the function in nodes.py
  2. graph.add_node("name", function)
  3. Wire it with graph.add_edge() or graph.add_conditional_edges()
"""

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from app.agent.state import AstraState
from app.agent.nodes import investigate, plan, act


def build_graph() -> StateGraph:
    """
    Assemble and compile the Astra LangGraph workflow.

    Returns a compiled graph that accepts AstraState and a config dict
    with a 'thread_id' for checkpointing:
        config = {"configurable": {"thread_id": "some-uuid"}}
        astra_graph.stream(init_state(alert), config)
    """
    graph = StateGraph(AstraState)

    # ── Register nodes ────────────────────────────────────────────────────────
    graph.add_node("investigate", investigate)   # Phase 6: ReAct diagnostic loop
    graph.add_node("plan",        plan)           # Choose remediation tool + confidence
    graph.add_node("act",         act)            # Execute the chosen tool

    # ── Wire edges ────────────────────────────────────────────────────────────
    graph.set_entry_point("investigate")
    graph.add_edge("investigate", "plan")
    graph.add_edge("plan",        "act")
    graph.add_edge("act",         END)

    # ── Compile with HITL checkpointing ───────────────────────────────────────
    # interrupt_before=["act"] pauses the graph BEFORE executing the act node.
    # The API layer checks confidence and either auto-resumes or holds for human approval.
    # MemorySaver stores the paused state in memory keyed by thread_id.
    memory = MemorySaver()
    return graph.compile(checkpointer=memory, interrupt_before=["act"])


# Single compiled instance — imported across the application
astra_graph = build_graph()
