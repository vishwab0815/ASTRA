<div align="center">

# 🌌 Astra — Enterprise Autonomous AIOps Engine

**Self-Healing Kubernetes Infrastructure Powered by LangGraph, Local RAG, and GitOps**

[![Python Version](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-ReAct%20State%20Machine-FF6F00?style=for-the-badge&logo=langchain&logoColor=white)](https://github.com/langchain-ai/langgraph)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Native-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Helm 3](https://img.shields.io/badge/Helm-v3.0%2B-0F1689?style=for-the-badge&logo=helm&logoColor=white)](https://helm.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

<br/>

*Astra investigates Kubernetes alerts in real-time, diagnoses root causes using multi-round telemetry reasoning and local vector memory, and safely applies GitOps remediations with Human-in-the-Loop confidence gates.*

---

</div>

## 📑 Table of Contents

- [Overview & Enterprise Value](#-overview--enterprise-value)
- [System Architecture & Dataflow](#-system-architecture--dataflow)
- [Codebase Topology & File Dictionary](#-codebase-topology--file-dictionary)
- [Why We Chose This Technology Stack (ADRs)](#-why-we-chose-this-technology-stack-adrs)
- [Core Enterprise Capabilities](#-core-enterprise-capabilities)
- [Getting Started & Local Development](#-getting-started--local-development)
- [Enterprise Helm Deployment](#-enterprise-helm-deployment)
- [Interactive API Reference](#-interactive-api-reference)
- [Observability & Prometheus Metrics](#-observability--prometheus-metrics)
- [Security & Air-Gapped Compliance](#-security--air-gapped-compliance)
- [Advanced System Design Deep Dive](#-advanced-system-design-deep-dive)

---

## 🚀 Overview & Enterprise Value

Traditional observability suites (Datadog, Dynatrace, PagerDuty) detect incidents and notify engineers, leaving on-call teams to wake up at 3:00 AM, manually gather logs, parse stack traces, decipher runbooks, and patch YAML configurations.

**Astra automates the entire incident lifecycle from detection to declarative GitOps fix:**

```
Alert Ingestion ──► Storm Triage ──► ReAct Diagnostics ──► RAG Runbook Match ──► Confidence Scored Fix ──► GitOps PR / Restart
```

| Dimension | Traditional Observability (Datadog / PagerDuty) | Astra Autonomous AIOps Engine |
|---|---|---|
| **Incident Response** | Passive alerting (notifies humans) | **Active autonomous diagnosis & remediation** |
| **Investigation** | Manual querying across multiple tabs | **Automated ReAct loop (logs, events, traces)** |
| **Runbook Knowledge** | Static Confluence/Wiki documentation | **Semantic Vector RAG (`all-MiniLM-L6-v2`)** |
| **Remediation Method** | Imperative cluster mutations via SSH/kubectl | **Declarative GitOps Pull Requests (`ruamel.yaml`)** |
| **Safety Model** | All-or-nothing execution | **Confidence-gated Human-in-the-Loop (Slack HITL)** |
| **Data Privacy** | Cloud SaaS (telemetry leaves your network) | **100% Air-Gapped & on-premise friendly** |

---

## 🏗️ System Architecture & Dataflow

> [!NOTE]
> For the complete architectural design specification, state diagrams, and failure mode matrices, see the **[Advanced System Design Guide](docs/SYSTEM_DESIGN.md)**.

The diagram below illustrates Astra's end-to-end processing pipeline:

```mermaid
flowchart TB
    classDef src fill:#1e293b,stroke:#475569,stroke-width:2px,color:#f8fafc;
    classDef gate fill:#0f766e,stroke:#14b8a6,stroke-width:2px,color:#f0fdfa;
    classDef core fill:#1e1b4b,stroke:#6366f1,stroke-width:2px,color:#e0e7ff;
    classDef store fill:#312e81,stroke:#818cf8,stroke-width:2px,color:#e0e7ff;
    classDef act fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;

    SRC["☸️ Prometheus Alertmanager / Webhook"]:::src -->|"POST /webhook (Bearer Auth)"| API["🚀 FastAPI Edge Ingestion"]:::gate
    API -->|"Instant 202 Accepted"| TRIAGE["🛡️ Triage & Deduplication Engine"]:::gate
    
    TRIAGE -->|"Drop if astra.ai/ignore or duplicate"| DROP["❌ Suppress Alert"]:::src
    TRIAGE -->|"Novel Alert"| SEM["🚦 Concurrency Semaphore (Max 10)"]:::gate

    SEM -->|"Dispatch Worker"| INV["🔍 ReAct Investigate Node (1..3 Rounds)"]:::core
    
    INV <-->|"Fetch Logs & Describe"| K8S["☸️ K8s API Server"]:::act
    INV <-->|"Query Traces"| TRACE["📊 OpenTelemetry / Jaeger"]:::act
    INV <-->|"Semantic Search"| RAG["🧠 ChromaDB Vector Memory"]:::store

    INV --> PLAN["📋 Plan Node (Calculate Confidence)"]:::core

    PLAN --> GATE{"Confidence &gt;= 75%?"}:::core
    GATE -->|"Yes: High Confidence"| ACT["⚡ Act Node (GitOps Patch / Restart)"]:::act
    GATE -->|"No: Uncertain"| PAUSE["⏸️ Pause Node & Notify Slack"]:::core

    PAUSE -->|"Human Approves via POST"| ACT
    ACT --> AUDIT[("🗄️ SQLite Audit Trail (WAL Mode)")]:::store
```

---

## 📂 Codebase Topology & File Dictionary

Every module in Astra has a singular, decoupled responsibility:

```
astra/
├── app/
│   ├── main.py                  # Application entrypoint, lifespan, health routes, OpenAPI config
│   ├── agent/                   # LangGraph State Machine & ReAct Loop
│   │   ├── graph.py             # StateGraph definition and SqliteSaver checkpoint binding
│   │   ├── nodes.py             # ReAct investigate, plan, act node handlers & tenacity retries
│   │   └── state.py             # Mutable TypedDict state schema passed between nodes
│   ├── api/                     # Ingress & Protocol Layer
│   │   ├── routes.py            # HTTP endpoints, API key verification, async semaphore
│   │   ├── schemas.py           # Pydantic v2 request/response validation schemas
│   │   └── metrics.py           # Prometheus instrumentation (counters, gauges, histograms)
│   ├── core/                    # Foundation & Settings
│   │   ├── config.py            # Pydantic BaseSettings loaded from .env
│   │   └── logging.py           # Structured JSON logger with correlation IDs
│   ├── db/                      # Persistence Layer
│   │   ├── database.py          # SQLite engine setup, WAL mode activation, DDL migrations
│   │   └── models.py            # Audit event data classes
│   ├── services/                # Business Services
│   │   ├── triage.py            # Storm deduplication & Kubernetes annotation opt-out logic
│   │   ├── rag.py               # ChromaDB vector store client & HuggingFace embedding engine
│   │   ├── audit.py             # Audit trail transaction recording service
│   │   ├── slack.py             # Slack Block Kit notification and approval builder
│   │   └── alertmanager.py      # Prometheus Alertmanager payload normalizer
│   └── tools/                   # Diagnostic & Remediation Tools
│       ├── k8s_tools.py         # Kubernetes Python SDK wrapper (with offline mock fallback)
│       ├── gitops_tools.py      # ruamel.yaml comment-preserving AST modifier for PRs
│       ├── rag_tools.py         # LangChain @tool wrapper for search_company_runbooks
│       ├── trace_tools.py       # Distributed tracing & bottleneck analyzer
│       └── security.py          # Prompt injection log sanitizer & XML boundary defense
├── helm/astra/                  # Enterprise Kubernetes Helm 3 Package
│   ├── Chart.yaml               # Package metadata
│   ├── values.yaml              # Central enterprise configuration
│   └── templates/               # Kubernetes resource templates (Deployment, RBAC, PVC, Secret)
├── docs/                        # Architecture & Engineering Specifications
│   └── SYSTEM_DESIGN.md         # Advanced system design, Mermaid flows, and ADRs
├── scripts/                     # Developer Operations
│   ├── dev.py                   # Unified CLI runner (start, test, clean, check)
│   └── seed_runbooks.py         # Vector database ingestion CLI with 5 built-in enterprise runbooks
└── tests/                       # Automated Pytest Suite (25 Tests)
    ├── conftest.py              # Isolated fixtures and thread ID generators
    ├── test_phase1.py           # 23 tests verifying ReAct reasoning, parsing, and execution
    └── test_triage.py           # Tests for storm suppression, regex parsing, and annotations
```

### Comprehensive File Reference

| File | Primary Responsibility | Key Functions / Classes | Upstream Callers | Downstream Dependencies |
|---|---|---|---|---|
| [`app/main.py`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/app/main.py) | Application host & lifespan lifecycle | `lifespan()`, `health_check()`, `readiness_check()` | Uvicorn ASGI | `app/api/routes.py`, `app/api/metrics.py`, `app/db/database.py` |
| [`app/api/routes.py`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/app/api/routes.py) | REST API & Concurrency Gate | `_run_workflow()`, `verify_api_key()`, `POST /webhook` | Alertmanager / SRE | `app/agent/graph.py`, `app/services/triage.py`, `app/services/audit.py` |
| [`app/agent/nodes.py`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/app/agent/nodes.py) | AI Reasoning & Diagnostic Execution | `investigate()`, `plan()`, `act()`, `safe_json_parse()` | `app/agent/graph.py` | `app/tools/*`, `app/core/config.py`, `Groq API` |
| [`app/services/triage.py`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/app/services/triage.py) | Storm Deduplication & Opt-Out | `should_triage_suppress()`, `extract_workload_name()` | `app/api/routes.py` | `app/tools/k8s_tools.py`, `app/db/database.py` |
| [`app/services/rag.py`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/app/services/rag.py) | Vector Storage & Runbook Memory | `get_vector_store()`, `search_runbooks()`, `ingest_document()` | `app/tools/rag_tools.py` | `ChromaDB`, `all-MiniLM-L6-v2` |
| [`app/tools/gitops_tools.py`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/app/tools/gitops_tools.py) | Declarative GitOps PR Creator | `gitops_patch()`, `update_yaml_manifest()` | `app/agent/nodes.py` | `ruamel.yaml`, `Git CLI` |
| [`app/tools/security.py`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/app/tools/security.py) | Prompt Injection Defense | `sanitize_untrusted_input()` | `app/tools/k8s_tools.py` | Python stdlib |

---

## 🔬 Why We Chose This Technology Stack (ADRs)

> [!TIP]
> Architecture Decision Records (ADRs) document why specific tools were selected over common industry alternatives.

```
┌─────────────────────────┬───────────────────────────────┬────────────────────────────────────────────────────────┐
│ Technology Choice       │ Alternative Considered        │ Architectural Rationale                                │
├─────────────────────────┼───────────────────────────────┼────────────────────────────────────────────────────────┤
│ LangGraph               │ CrewAI / AutoGen / Chains     │ Deterministic state transitions, checkpointing, HITL   │
│ all-MiniLM-L6-v2 (CPU)  │ OpenAI text-embedding-3-small │ 100% Air-Gapped; zero proprietary logs egress cluster │
│ ruamel.yaml             │ PyYAML                        │ Round-trip AST parser preserves comments & formatting  │
│ SQLite WAL Mode         │ PostgreSQL / MySQL            │ Embedded, zero-cloud dependency, 5000+ ops/sec         │
│ asyncio.Semaphore       │ Celery / RabbitMQ / Redis     │ Lightweight in-memory rate limiting; keeps footprint <250MB │
└─────────────────────────┴───────────────────────────────┴────────────────────────────────────────────────────────┘
```

1. **Why LangGraph over CrewAI/AutoGen?** Infrastructure remediation requires strict determinism. LangGraph's `StateGraph` enforces structured cyclic loops with maximum iteration limits, provides first-class `SqliteSaver` crash recovery, and allows clean interruption for human approval gates.
2. **Why local `all-MiniLM-L6-v2` over OpenAI Embeddings?** Enterprise security policies forbid sending internal runbooks or stack traces to external cloud APIs. `all-MiniLM-L6-v2` runs locally on CPU with a 22MB memory footprint in <15ms.
3. **Why `ruamel.yaml` over `PyYAML`?** Standard `PyYAML` destroys comments and alters formatting. `ruamel.yaml` preserves comments and structure, which is required when opening GitOps PRs against production repositories.

---

## ⚡ Core Enterprise Capabilities

### 1. Multi-Step ReAct Diagnostics
Astra never hallucinates a fix based only on the alert name. During investigation, the agent dynamically invokes tools:
* `describe_pod`: Extracts exit codes, OOM events, and probe status.
* `get_logs`: Retrieves container output through prompt-injection sanitizers.
* `analyze_traces`: Queries distributed tracing to identify downstream microservice latency.
* `search_company_runbooks`: Semantically matches errors against past incident post-mortems.

### 2. Developer Opt-Out Annotations
Application teams can selectively opt-out critical workloads by adding an annotation to their `deployment.yaml`:
```yaml
metadata:
  annotations:
    astra.ai/ignore: "true"
```
Astra's Triage Engine inspects metadata on arrival and drops opted-out workloads before running LLM queries.

### 3. Asynchronous Ingestion & Concurrency Throttling
* **`< 5ms` Response Time:** Returns `202 Accepted` immediately and offloads work to `BackgroundTasks`.
* **Semaphore Rate Limiting:** Limits concurrent LLM calls via `asyncio.Semaphore` (default: 10) to prevent provider rate limits (`HTTP 429`).
* **Non-Blocking Execution:** Runs synchronous LangGraph pipelines in worker threads via `asyncio.to_thread`.

### 4. Zero-Data-Loss Persistence (`SqliteSaver`)
* State graph checkpoints are serialized to disk (`astra_checkpoints.db`).
* If Astra restarts while waiting for human approval, the workflow resumes seamlessly from its saved checkpoint upon reboot.

---

## 🛠️ Getting Started & Local Development

### Prerequisites
* **Python 3.10+**
* **Groq API Key** (or compatible LLM endpoint)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/astra.git
cd astra

# 2. Set up virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
```

### Seeding Vector Knowledge Base
Load enterprise Kubernetes runbooks into ChromaDB before starting:
```bash
python scripts/seed_runbooks.py
```

### Using Developer CLI (`dev.py`)
```bash
# Check configuration health
python scripts/dev.py check

# Run automated test suite (25/25 tests)
python scripts/dev.py test

# Start local server on port 8081
python scripts/dev.py start
```

---

## 📦 Enterprise Kubernetes & Helm YAML Architecture

Astra includes production-grade Kubernetes packaging in [`helm/astra/`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra) and standalone cluster test harnesses in [`demo-cluster/k8s/`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/demo-cluster/k8s).

### ☸️ Helm Chart Manifests Breakdown (`helm/astra/`)

| Manifest File | Kubernetes Kind | Exact Purpose & Architectural Role |
|---|---|---|
| [`values.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra/values.yaml) | Configuration | **The Enterprise Control Plane:** Single contract where platform engineers tune CPU/memory limits, concurrency semaphores, confidence thresholds, and inject API keys. |
| [`Chart.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra/Chart.yaml) | Helm Metadata | Defines package version (`0.1.0`), application version (`0.4.0`), and repository keywords for enterprise artifact registries (Artifact Hub / Harbor). |
| [`templates/deployment.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra/templates/deployment.yaml) | `Deployment` | **Core Process Controller:** Manages the Astra container lifespan, mounts the `/app/data` persistent storage volume, injects environment variables from ConfigMaps/Secrets, and wires `/health` liveness and `/health/ready` deep readiness probes. |
| [`templates/rbac.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra/templates/rbac.yaml) | `ClusterRole`, `ClusterRoleBinding`, `ServiceAccount` | **Security Perimeter:** Implements least-privilege RBAC. Grants Astra read-only diagnostic access (`get/list/watch` on pods, logs, events) and controlled remediation (`delete` on pods). **Explicitly forbids access to cluster Secrets, Ingresses, and Nodes** to prevent privilege escalation. |
| [`templates/pvc.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra/templates/pvc.yaml) | `PersistentVolumeClaim` | **State Persistence Guarantee:** Allocates a 10Gi disk mounted to `/app/data`. Ensures that both SQLite checkpoint state (`astra_checkpoints.db`) and the local ChromaDB vector database survive container upgrades, node drains, and pod evictions. |
| [`templates/configmap.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra/templates/configmap.yaml) | `ConfigMap` | Decouples non-sensitive configuration (`CONFIDENCE_THRESHOLD`, `MAX_CONCURRENT_WORKFLOWS`, `DRY_RUN`, `AUDIT_DB_PATH`) from application code so settings can be updated without rebuilding images. |
| [`templates/secret.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra/templates/secret.yaml) | `Secret` | Encrypts and securely mounts sensitive credentials (`GROQ_API_KEY`, `ASTRA_API_KEY`, `SLACK_BOT_TOKEN`) into container environment variables using Kubernetes native base64 secrets. |
| [`templates/service.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra/templates/service.yaml) | `Service` (`ClusterIP`) | Exposes internal port `8081` so Prometheus Alertmanager and cluster webhooks can route alerts to Astra via DNS (e.g. `http://astra.astra-system.svc.cluster.local:8081/alertmanager`). |
| [`templates/_helpers.tpl`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/helm/astra/templates/_helpers.tpl) | Go Template Partials | Reusable helper templates generating standardized Kubernetes resource names, standard chart labels (`app.kubernetes.io/name`), and dynamic ServiceAccount selectors. |

---

### 🧪 Standalone Test Manifests (`demo-cluster/k8s/`)

| Manifest File | Kubernetes Kind | Exact Purpose & Architectural Role |
|---|---|---|
| [`demo-cluster/k8s/deployment.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/demo-cluster/k8s/deployment.yaml) | `Deployment` | A mock target application that simulates an OOMKilled crashlooping microservice. Used for running live remediation end-to-end tests against real or Minikube/Kind clusters. |
| [`demo-cluster/k8s/rbac.yaml`](file:///c:/Users/Vishwanath%20B/Desktop/PROJECT/2026%20project/astra/demo-cluster/k8s/rbac.yaml) | `Role`, `RoleBinding`, `ServiceAccount` | A standalone, namespace-scoped RBAC manifest designed for rapid local developer testing without requiring full cluster-admin rights or Helm execution. |

---

### 🚀 Production Helm Deployment Guide

```bash
# 1. Add overrides in a custom company-values.yaml
cat <<EOF > company-values.yaml
config:
  confidenceThreshold: "0.80"
  dryRun: "false"
  maxConcurrentWorkflows: "15"

secrets:
  groqApiKey: "gsk_live_api_key"
  astraApiKey: "your-production-secret-api-key"
  slackBotToken: "xoxb-your-slack-bot-token"
  slackChannelId: "C0123456789"

resources:
  requests:
    cpu: 500m
    memory: 2Gi
  limits:
    cpu: 2000m
    memory: 4Gi
EOF

# 2. Deploy to Kubernetes
helm install astra ./helm/astra \
  --namespace astra-system \
  --create-namespace \
  -f company-values.yaml
```

---

## 📡 Interactive API Reference

All endpoints (except `/health`) require the authentication header:
```http
Authorization: Bearer <ASTRA_API_KEY>
```

<details>
<summary><b>1. Ingest Single Alert (POST /webhook)</b></summary>

#### Request
```bash
curl -X POST http://localhost:8081/webhook \
  -H "Authorization: Bearer change-me-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "alert": "PodCrashLoopBackOff",
    "pod": "auth-service-7bb8c-x9k2",
    "namespace": "production"
  }'
```

#### Response (`HTTP 202 Accepted`)
```json
{
  "status": "processing",
  "message": "Alert received and queued for asynchronous background investigation.",
  "thread_id": "8f3b2d10-4c7a-4299-b1fa-8910e5d4cb09",
  "result": null
}
```
</details>

<details>
<summary><b>2. Ingest Alertmanager Batch (POST /alertmanager)</b></summary>

#### Request
```bash
curl -X POST http://localhost:8081/alertmanager \
  -H "Authorization: Bearer change-me-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "4",
    "status": "firing",
    "alerts": [
      {
        "labels": {
          "alertname": "KubePodCrashLooping",
          "pod": "payment-api-6d8b-z91q",
          "namespace": "default"
        }
      }
    ]
  }'
```
</details>

<details>
<summary><b>3. Human-in-the-Loop Approval Gate (POST /threads/{thread_id}/approve)</b></summary>

When confidence is `< 0.75`, the workflow pauses and alerts Slack. Approve or abort the remediation:

#### Request
```bash
curl -X POST http://localhost:8081/threads/8f3b2d10-4c7a-4299-b1fa-8910e5d4cb09/approve \
  -H "Authorization: Bearer change-me-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true
  }'
```

#### Response (`HTTP 200 OK`)
```json
{
  "thread_id": "8f3b2d10-4c7a-4299-b1fa-8910e5d4cb09",
  "status": "resumed_and_resolved",
  "tool_executed": "gitops_patch"
}
```
</details>

<details>
<summary><b>4. Health & Deep Readiness Probes (GET /health & /health/ready)</b></summary>

* `GET /health` (Liveness): Returns `200 OK` if process is active.
* `GET /health/ready` (Readiness): Verifies SQLite databases and LLM endpoint availability before accepting traffic.

```json
{
  "status": "ready",
  "version": "0.4.0",
  "checks": {
    "audit_db": "ok",
    "checkpoint_db": "ok",
    "llm_api": "ok"
  }
}
```
</details>

---

## 📊 Observability & Prometheus Metrics

Astra exposes metrics on `/metrics` for Prometheus scraping:

```
# Scrape endpoint
GET http://localhost:8081/metrics
```

| Metric Name | Type | Description |
|---|---|---|
| `astra_alerts_received_total` | Counter | Total alerts ingested across all namespaces |
| `astra_alerts_resolved_total` | Counter | Remediations executed automatically without intervention |
| `astra_alerts_paused_total` | Counter | Workflows held for Human-in-the-Loop approval |
| `astra_alerts_approved_total` | Counter | Workflows approved by on-call operators |
| `astra_alerts_rejected_total` | Counter | Workflows aborted by on-call operators |
| `astra_queued_workflows` | Gauge | Alerts currently queued waiting for a concurrency slot |
| `astra_agent_confidence` | Histogram | Distribution of agent confidence ratings (0.0 to 1.0) |
| `astra_investigation_rounds` | Histogram | Number of diagnostic tool rounds used per alert (1 to 5) |

---

## 🔒 Security & Air-Gapped Compliance

1. **Prompt Injection Boundary:** All log outputs and cluster events pass through `sanitize_untrusted_input()` and are isolated in strict `<untrusted_logs>` XML envelopes.
2. **Least-Privilege RBAC:** The Helm `ClusterRole` grants read-only diagnostics and single-pod delete permissions. Access to cluster Secrets and Ingress resources is blocked.
3. **Local Vector Embeddings:** Runbook vectors are computed on CPU with `sentence-transformers`—no internal documentation leaves your security perimeter.
4. **Dry-Run Mode Guard:** Mutating operations require `DRY_RUN=false` to affect live clusters.

---

## 📖 Advanced System Design Deep Dive

For in-depth architectural specifications, sequence diagrams, failure recovery mechanics, and data persistence models:

👉 **[Read the Full Advanced System Design Guide (docs/SYSTEM_DESIGN.md)](docs/SYSTEM_DESIGN.md)**

---

<div align="center">
<b>Astra — Autonomous, Resilient, Production-Ready AIOps.</b>
</div>
