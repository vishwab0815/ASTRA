"""
Astra — Runbook Seeding Script

Loads company runbooks, historical incident post-mortems, and troubleshooting
guides into the Astra vector database so the AI can reference them during
investigations.

Usage:
    python scripts/seed_runbooks.py                    # Load all built-in runbooks
    python scripts/seed_runbooks.py --file my_runbook.md  # Load a specific file
    python scripts/seed_runbooks.py --clear            # Clear the DB and reload

How it works:
  1. Each runbook is a plain text or markdown string
  2. It is converted to a vector embedding using all-MiniLM-L6-v2 (runs locally)
  3. The embedding is stored in ChromaDB at .chroma_db/
  4. When Astra investigates an alert, it searches this DB for relevant context

Adding your own company runbooks:
  - Add a new entry to COMPANY_RUNBOOKS below, or
  - Place .md files in scripts/runbooks/ directory, or
  - Call ingest_document() from your own script

This script is idempotent — running it multiple times will not create duplicates
because ChromaDB uses the document ID for deduplication.
"""

import sys
import os
import argparse
import logging

# Allow imports from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# ── Built-in Runbooks ─────────────────────────────────────────────────────────
# These are realistic enterprise runbooks covering the most common Kubernetes
# incidents. In a real company, these would be imported from Confluence, Notion,
# or your internal wiki. Each runbook is plain text — no special format needed.

BUILT_IN_RUNBOOKS = [
    {
        "id":      "rb-001",
        "title":   "Kubernetes OOMKilled — OutOfMemory CrashLoop Resolution",
        "source":  "Built-in / Kubernetes Best Practices",
        "content": """
# Runbook: OOMKilled / OutOfMemory CrashLoopBackOff

## Symptoms
- Pod repeatedly crashing with exit code 137
- Kubernetes events show: "OOMKilling: Memory limit exceeded"
- Logs show: java.lang.OutOfMemoryError OR Killed (signal 9) OR "Cannot allocate memory"

## Root Cause
The container's memory limit is set too low for the application's actual memory usage.
When the kernel's OOM killer terminates a process, it exits with code 137 (128 + 9).

## Immediate Fix (Emergency)
1. Restart the pod to restore service: kubectl delete pod <pod-name> -n <namespace>
2. This is temporary — the pod will OOM again unless the limit is raised.

## Permanent Fix (GitOps)
Increase the memory limit in the deployment YAML:
  resources:
    limits:
      memory: 512Mi   # was 256Mi — double it as a starting point
    requests:
      memory: 256Mi
Then submit a Pull Request. After merge, ArgoCD/Flux will roll it out.

## Prevention
- Set memory requests = 70% of memory limits (gives headroom for spikes)
- Add HorizontalPodAutoscaler (HPA) so the cluster scales out instead of OOMKilling
- Monitor memory usage trend in Grafana — if growing 10%/day, raise limit proactively

## Related alerts
PodCrashLoopBackOff, ContainerOOMKilled, HighMemoryUsage
        """.strip(),
    },
    {
        "id":      "rb-002",
        "title":   "CrashLoopBackOff — General Diagnosis and Recovery",
        "source":  "Built-in / Kubernetes Best Practices",
        "content": """
# Runbook: CrashLoopBackOff

## What It Means
Kubernetes is restarting a container repeatedly because it keeps crashing.
The backoff timer increases exponentially: 10s, 20s, 40s, 80s, 160s, 300s (max).

## Diagnosis Steps (in order)
1. kubectl logs <pod> --previous    # Read the crash logs from BEFORE the restart
2. kubectl describe pod <pod>       # Check Events section for OOM, ImagePull, Probe failures
3. Check exit code:
   - Exit 0  : Application exited cleanly — check liveness probe is not too aggressive
   - Exit 1  : Application error — read the logs
   - Exit 137 : OOM killed — increase memory limits (see OOMKilled runbook)
   - Exit 139 : Segfault — application bug, escalate to dev team
   - Exit 143 : SIGTERM — application did not handle graceful shutdown

## Common Causes and Fixes
| Cause | Fix |
|---|---|
| OOM Killed (exit 137) | Increase memory limit via GitOps PR |
| Bad environment variable | Check ConfigMap/Secret referenced in deployment |
| Missing dependency | Application cannot connect to DB/Redis on startup |
| Liveness probe too aggressive | Increase initialDelaySeconds on liveness probe |
| Image pull failure | Check image name and registry credentials |

## Escalation
If exit code is 139 (segfault) or the crash happens immediately with no logs,
escalate to the application team — this is an application bug, not infrastructure.
        """.strip(),
    },
    {
        "id":      "rb-003",
        "title":   "ErrImagePull / ImagePullBackOff — Container Image Failures",
        "source":  "Built-in / Kubernetes Best Practices",
        "content": """
# Runbook: ErrImagePull / ImagePullBackOff

## Symptoms
- Pod stuck in Pending or Waiting state
- kubectl describe pod shows: "Failed to pull image"
- Reason: ImagePullBackOff or ErrImagePull

## Root Causes
1. Image tag does not exist in the registry
2. Registry credentials missing or expired (imagePullSecret)
3. Registry is unreachable from the cluster (network issue)
4. Image name typo in the deployment YAML

## Diagnosis
kubectl describe pod <pod-name> | grep -A5 "Events"
Look for the exact error message — it tells you whether it's auth, name, or network.

## Fix Steps
1. Verify image exists: docker pull <image:tag>
2. If auth error:
   kubectl create secret docker-registry regcred \
     --docker-server=<registry> \
     --docker-username=<user> \
     --docker-password=<token>
   Then add imagePullSecrets to the deployment via GitOps PR.
3. If tag does not exist: Update the image tag in deployment.yaml via GitOps PR.
4. If network: Check cluster egress rules and registry firewall.

## Prevention
- Use image digests (sha256) instead of tags in production — tags are mutable
- Set up registry mirroring inside the cluster for air-gapped environments
        """.strip(),
    },
    {
        "id":      "rb-004",
        "title":   "High Latency / HTTP 504 Timeout — Service Degradation",
        "source":  "Built-in / Distributed Systems Best Practices",
        "content": """
# Runbook: High Latency / HTTP 504 Gateway Timeout

## Symptoms
- Response times > 2000ms (P99)
- HTTP 504 errors from ingress/load balancer
- Downstream services reporting timeout errors

## Diagnosis Chain (work upstream from the error)
1. Check which service is slow first: kubectl top pods -n <namespace>
2. Check if it's CPU throttling: kubectl describe pod <pod> | grep -i cpu
3. Check downstream dependencies: database, redis, external APIs
4. Check for recent deployments that could explain latency spike

## Common Causes

### CPU Throttling
If a pod's CPU usage consistently hits its limit, requests queue up.
Fix: Increase CPU limit in deployment.yaml via GitOps PR.

### Database Connection Pool Exhaustion
Application cannot get a DB connection because the pool is full.
Symptoms: Timeout errors contain "connection pool" in stack trace.
Fix: Increase max_connections in application config, or add a connection pooler (PgBouncer).

### N+1 Query Problem
One API call triggers hundreds of DB queries.
Fix: Escalate to dev team — needs code change to add eager loading.

### External API Slow
Third-party API (payment gateway, auth provider) is having issues.
Fix: Check status page of the external provider. Add circuit breaker if not present.

## Immediate Mitigation
- Scale up the deployment: kubectl scale deployment <name> --replicas=5
- This helps if it's a traffic volume issue, not a per-request latency issue.

## Tracing
Use Jaeger distributed traces to pinpoint which microservice is adding latency.
Look for spans with duration > 1s in the trace waterfall.
        """.strip(),
    },
    {
        "id":      "rb-005",
        "title":   "Pod Pending — Node Resource Exhaustion / Scheduling Failure",
        "source":  "Built-in / Kubernetes Best Practices",
        "content": """
# Runbook: Pod Stuck in Pending State

## Symptoms
- Pod never transitions from Pending to Running
- kubectl describe pod shows "Insufficient cpu" or "Insufficient memory" in Events
- No node has enough available resources to schedule the pod

## Diagnosis
kubectl describe pod <pod-name>
Look at Events at the bottom. The scheduler will explain exactly why it failed.

## Common Causes and Fixes

### Insufficient Resources on All Nodes
The cluster has no node with enough CPU/memory to place this pod.
Fix options:
  1. Add more nodes (scale the node group / instance group)
  2. Lower the pod's resource requests in deployment.yaml via GitOps PR
  3. Remove or reschedule less critical workloads to free up space

### Node Selector / Affinity Mismatch
The pod requires a specific node label (e.g. GPU node) but no such node exists.
Fix: Check nodeSelector and nodeAffinity in the deployment spec.

### Taints and Tolerations
The pod does not tolerate the taints on any available node.
Fix: Add the appropriate toleration to the pod spec via GitOps PR.

### PersistentVolumeClaim Pending
The pod is waiting for a PVC that never got bound.
Fix: kubectl get pvc -n <namespace> — check the PVC status and StorageClass availability.

## Prevention
- Use Cluster Autoscaler to automatically add nodes when resources are tight
- Set Pod Disruption Budgets to prevent too many pods from being evicted simultaneously
        """.strip(),
    },
]


def seed_all(clear: bool = False) -> None:
    """Load all built-in runbooks into the vector store."""
    from app.services.rag import get_vector_store, ingest_document

    store = get_vector_store()

    if clear:
        logger.info("Clearing existing runbook database...")
        store.delete_collection()
        # Re-initialize the store after clearing
        import app.services.rag as rag_module
        rag_module._vector_store = None
        rag_module._embeddings   = None
        store = get_vector_store()

    logger.info(f"Seeding {len(BUILT_IN_RUNBOOKS)} built-in runbooks...")
    success = 0
    for runbook in BUILT_IN_RUNBOOKS:
        ok = ingest_document(
            content=runbook["content"],
            metadata={
                "id":     runbook["id"],
                "title":  runbook["title"],
                "source": runbook["source"],
            },
        )
        if ok:
            logger.info(f"  [OK] {runbook['id']}: {runbook['title']}")
            success += 1
        else:
            logger.error(f"  [FAIL] {runbook['id']}: {runbook['title']}")

    logger.info(f"\nSeeding complete: {success}/{len(BUILT_IN_RUNBOOKS)} runbooks loaded.")


def seed_from_file(filepath: str) -> None:
    """Load a single markdown/text file into the vector store."""
    from app.services.rag import ingest_document

    path = os.path.abspath(filepath)
    if not os.path.exists(path):
        logger.error(f"File not found: {path}")
        sys.exit(1)

    with open(path, encoding="utf-8") as f:
        content = f.read()

    title  = os.path.basename(path).replace(".md", "").replace("_", " ").title()
    ok = ingest_document(
        content=content,
        metadata={"title": title, "source": path},
    )
    if ok:
        logger.info(f"Successfully ingested: {title}")
    else:
        logger.error(f"Failed to ingest: {title}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Seed Astra's runbook vector database with historical incident knowledge."
    )
    parser.add_argument(
        "--file",
        help="Path to a specific .md or .txt runbook file to ingest",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear the database before seeding (start fresh)",
    )
    args = parser.parse_args()

    if args.file:
        seed_from_file(args.file)
    else:
        seed_all(clear=args.clear)
