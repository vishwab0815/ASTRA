"""
Astra — Kubernetes Tools

All interactions with the Kubernetes API live here.

Diagnostic tools (read-only, safe to call any time):
  - get_logs(pod, namespace)       → recent pod log lines
  - describe_pod(pod, namespace)   → pod status, conditions, events

Remediation tools (write operations, guarded by DRY_RUN):
  - restart_pod(pod, namespace)    → delete pod so ReplicaSet recreates it
  - scale_resources(pod, namespace)→ patch resource limits (stub, DRY-RUN only)
  - check_image(pod, namespace)    → inspect image pull failure reason

Tool registry:
  TOOL_REGISTRY maps the exact string names the LLM produces
  to the Python functions above. execute_tool() dispatches here.

K8s connectivity:
  Attempted at import time using the local kubeconfig.
  If no cluster is reachable, K8S_AVAILABLE = False and all functions
  return realistic mock responses so development works without a cluster.
"""

import logging
from app.core.config import settings
from app.tools.trace_tools import analyze_traces
from app.tools.security import sanitize_untrusted_input
from app.tools.gitops_tools import gitops_patch

logger = logging.getLogger(__name__)


# ── Kubernetes client bootstrap ────────────────────────────────────────────────

try:
    from kubernetes import client, config as k8s_config

    # Enterprise Security: Attempt In-Cluster authentication first
    try:
        k8s_config.load_incluster_config()
        logger.info("Kubernetes Auth: Authenticated using In-Cluster ServiceAccount Token.")
    except k8s_config.ConfigException:
        # Fallback to local kubeconfig for developer laptops
        k8s_config.load_kube_config()
        logger.info("Kubernetes Auth: Authenticated using local ~/.kube/config (Developer Mode).")

    _core_v1 = client.CoreV1Api()
    K8S_AVAILABLE = True

except Exception as exc:
    logger.warning(
        f"Kubernetes client unavailable ({exc}). "
        "All tools will return mock responses. "
        "To connect a real cluster, ensure a valid kubeconfig or ServiceAccount exists."
    )
    K8S_AVAILABLE = False
    _core_v1 = None


def get_pod_annotations(pod: str, namespace: str = "default") -> dict[str, str]:
    """
    Fetch the annotations of a specific pod.
    Used by the Triage engine to check for enterprise opt-out flags like 'astra.ai/ignore'.
    """
    if K8S_AVAILABLE:
        try:
            pod_obj = _core_v1.read_namespaced_pod(name=pod, namespace=namespace)
            return pod_obj.metadata.annotations or {}
        except Exception as exc:
            logger.debug(f"Could not fetch annotations for {pod}/{namespace}: {exc}")
            return {}
    return {}


# ── Diagnostic tools (read-only) ───────────────────────────────────────────────

def get_logs(pod: str, namespace: str = "default") -> str:
    """
    Fetch the last 50 log lines from the pod.
    Used by the ReAct investigate loop to understand what the pod is doing.
    """
    if K8S_AVAILABLE:
        try:
            raw_logs = _core_v1.read_namespaced_pod_log(
                name=pod, namespace=namespace, tail_lines=50
            )
            return sanitize_untrusted_input(raw_logs)
        except Exception as exc:
            return f"❌ Could not fetch logs for {pod}/{namespace}: {exc}"

    return sanitize_untrusted_input(
        f"[{pod}] WARN : Memory usage at 95% of limit\n"
        f"[{pod}] ERROR: java.lang.OutOfMemoryError: Java heap space\n"
        f"[{pod}] ERROR: Container killed by OOM killer (exit code 137)\n"
        f"[{pod}] INFO : Restart count: 5 | Last restart: 2 minutes ago"
    )


def describe_pod(pod: str, namespace: str = "default") -> str:
    """
    Fetch pod status, container states, and recent Kubernetes events.
    Used by the ReAct investigate loop for a broader system-level view
    beyond what logs alone can show (e.g. scheduling failures, resource limits).
    """
    if K8S_AVAILABLE:
        try:
            pod_obj = _core_v1.read_namespaced_pod(name=pod, namespace=namespace)
            phase   = pod_obj.status.phase or "Unknown"
            lines   = [f"Phase: {phase}"]

            for cs in pod_obj.status.container_statuses or []:
                state = cs.state
                if state.waiting:
                    lines.append(f"Container '{cs.name}': Waiting — {state.waiting.reason}")
                elif state.running:
                    lines.append(f"Container '{cs.name}': Running since {state.running.started_at}")
                elif state.terminated:
                    lines.append(
                        f"Container '{cs.name}': Terminated — exit code {state.terminated.exit_code}, "
                        f"reason: {state.terminated.reason}"
                    )
                lines.append(f"  Restart count: {cs.restart_count}")

            # Recent events (last 5)
            events = _core_v1.list_namespaced_event(
                namespace=namespace,
                field_selector=f"involvedObject.name={pod}",
            )
            if events.items:
                lines.append("\nRecent Events:")
                for evt in events.items[-5:]:
                    lines.append(f"  [{evt.type}] {evt.reason}: {evt.message}")

            return "\n".join(lines)

        except Exception as exc:
            return f"ERROR: Could not describe pod {pod}/{namespace}: {exc}"

    # Realistic mock
    return (
        f"Phase: Running\n"
        f"Container '{pod}': Waiting -- CrashLoopBackOff\n"
        f"  Restart count: 7\n"
        f"\nRecent Events:\n"
        f"  [Warning] BackOff: Back-off restarting failed container\n"
        f"  [Warning] OOMKilling: Memory limit of 256Mi exceeded"
    )


# ── Remediation tools (write operations) ─────────────────────────────────────

def restart_pod(pod: str, namespace: str = "default") -> str:
    """
    Delete the pod so its ReplicaSet/Deployment recreates it with a clean state.
    This is the standard Kubernetes rolling restart for a single pod.

    Guarded by DRY_RUN=True by default — set DRY_RUN=false in .env for live execution.
    """
    if K8S_AVAILABLE and not settings.dry_run:
        try:
            _core_v1.delete_namespaced_pod(name=pod, namespace=namespace)
            return (
                f"✅ Pod '{pod}' in '{namespace}' deleted. "
                f"The ReplicaSet will recreate it momentarily."
            )
        except Exception as exc:
            return f"❌ Failed to restart pod {pod}/{namespace}: {exc}"

    return (
        f"[DRY-RUN] restart_pod(pod={pod!r}, namespace={namespace!r})\n"
        f"   In live mode: deletes the pod, ReplicaSet recreates it cleanly."
    )


def scale_resources(pod: str, namespace: str = "default") -> str:
    """
    Patch the CPU and memory limits of the pod's parent Deployment/StatefulSet.
    Currently implemented as DRY-RUN only — Phase 7 will add the real patch call.
    """
    return (
        f"[DRY-RUN] scale_resources(pod={pod!r}, namespace={namespace!r})\n"
        f"   Would patch parent Deployment: memory 256Mi -> 512Mi | CPU 500m -> 1000m"
    )


def check_image(pod: str, namespace: str = "default") -> str:
    """
    Inspect the pod's container statuses to extract the image pull error reason.
    Useful for diagnosing ErrImagePull and ImagePullBackOff failures.
    """
    if K8S_AVAILABLE:
        try:
            pod_obj = _core_v1.read_namespaced_pod(name=pod, namespace=namespace)
            for cs in pod_obj.status.container_statuses or []:
                if cs.state.waiting and "pull" in (cs.state.waiting.reason or "").lower():
                    return (
                        f"❌ Image pull failed for container '{cs.name}' in pod '{pod}'\n"
                        f"   Reason : {cs.state.waiting.reason}\n"
                        f"   Message: {cs.state.waiting.message}"
                    )
            return f"ℹ️  No image pull errors found for pod '{pod}' in '{namespace}'."
        except Exception as exc:
            return f"❌ Could not inspect pod {pod}/{namespace}: {exc}"

    return (
        f"[MOCK] Image pull failed for '{pod}' in '{namespace}'\n"
        f"   Reason : ErrImagePull -- repository not found or tag does not exist\n"
        f"   Fix    : Verify the image name and ensure registry credentials are correct."
    )


# ── Tool registry ──────────────────────────────────────────────────────────────
# Maps the exact string names the LLM produces to Python functions.
# The act() node dispatches via execute_tool() using state["tool"].
# Adding a new tool: add the function above, then add it here.

TOOL_REGISTRY: dict[str, callable] = {
    "restart_pod":     restart_pod,
    "scale_resources": scale_resources,
    "check_image":     check_image,
    "get_logs":        get_logs,
    "gitops_patch":    gitops_patch,
}

DIAGNOSTIC_TOOLS: dict[str, callable] = {
    "get_logs":       get_logs,
    "describe_pod":   describe_pod,
    "analyze_traces": analyze_traces,
}


def execute_tool(tool_name: str, pod: str, namespace: str = "default") -> str:
    """
    Dispatch to the correct remediation tool using the exact tool name
    chosen by the LLM in the plan node.

    Falls back to get_logs with a warning if the tool name is not recognised.
    This prevents a missing key from crashing a live remediation.
    """
    fn = TOOL_REGISTRY.get(tool_name)
    if fn is None:
        logger.warning(
            f"Unknown tool '{tool_name}' requested — falling back to get_logs.",
            extra={"tool": tool_name, "pod": pod},
        )
        return f"⚠️ Unknown tool '{tool_name}'.\n" + get_logs(pod, namespace)
    return fn(pod, namespace)
