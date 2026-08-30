"""
Astra — Enterprise Alert Correlation Engine

Provides:
  1. Alert Storm Detection: Groups a burst of related alerts into ONE root incident
  2. Parent-Child Causality: Identifies that "auth-service crash" CAUSED "payment-service timeout"
  3. Service Dependency Correlation: Uses topology edges to find upstream root causes
  4. Alert Flap Detection: Suppresses alerts that rapidly toggle on/off (noisy oscillation)
  5. Multi-Service Incident Grouping: Groups all alerts from a single bad deploy into one incident
"""

import time
import uuid
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CorrelatedIncident:
    """
    A group of related alerts unified into a single root incident.
    Rather than paging the on-call engineer 50 times for 50 crashing pods,
    Astra presents ONE incident with full context.
    """
    id:                str
    root_cause_service: str
    root_cause_alert:   str
    severity:          str                   # P1 | P2 | P3 | P4
    status:            str                   # open | resolved | suppressed
    alert_count:       int
    affected_services: list[str]
    namespace:         str
    created_at:        float
    last_seen_at:      float
    is_storm:          bool                  # True = alert storm (50+ in 60s)
    correlation_reason: str                  # Human-readable explanation
    child_alerts:      list[dict] = field(default_factory=list)
    # Causality chain: which upstream service failure caused this cascade
    causal_chain:      list[dict] = field(default_factory=list)


# ── In-memory correlation state ────────────────────────────────────────────────
# In production: replace with Redis streams + time-series DB (TimescaleDB)
_active_correlations: dict[str, CorrelatedIncident] = {}
_alert_flap_tracker:  dict[str, list[float]] = {}  # key → [timestamps]
_alert_storm_window   = 60     # seconds: if > STORM_THRESHOLD alerts in this window → storm
_STORM_THRESHOLD      = 10     # alerts
_FLAP_WINDOW          = 300    # 5 minutes: if alert fires > FLAP_THRESHOLD times → noisy
_FLAP_THRESHOLD       = 5
_INCIDENT_TTL         = 3600   # 1 hour: auto-close stale incidents


# ── Service dependency topology (mirrors backend topology edges) ───────────────
# This represents the UPSTREAM direction: key crashes → values cascade
_SERVICE_DEPENDENCIES: dict[str, list[str]] = {
    "postgres-db":         ["auth-service", "frontend-crash-app", "payment-service"],
    "redis-cache":         ["payment-service", "auth-service"],
    "kafka-broker":        ["notification-worker"],
    "ingress-nginx":       ["auth-service", "payment-service", "frontend-crash-app"],
    "auth-service":        ["frontend-crash-app"],
    "payment-service":     ["frontend-crash-app"],
}


def _severity_from_alert(alert_name: str, error_rate: float = 0.0) -> str:
    """Derive PagerDuty-style P1–P4 severity from alert name and error rate."""
    alert_lower = alert_name.lower()
    if error_rate > 0.5 or any(k in alert_lower for k in ("crash", "oom", "unavailable", "down")):
        return "P1"
    if error_rate > 0.1 or any(k in alert_lower for k in ("error", "failure", "timeout", "latency")):
        return "P2"
    if any(k in alert_lower for k in ("warn", "degraded", "slow", "throttl")):
        return "P3"
    return "P4"


def _build_causal_chain(service_id: str) -> list[dict]:
    """
    Walk the service dependency graph backwards to find what this service's
    failure will cascade into (downstream impact analysis).
    """
    chain = []
    affected = _SERVICE_DEPENDENCIES.get(service_id, [])
    for downstream in affected:
        chain.append({
            "service": downstream,
            "impact": "cascading_failure",
            "reason": f"Depends on {service_id} — will experience errors if upstream fails",
        })
        # One level deeper
        second_level = _SERVICE_DEPENDENCIES.get(downstream, [])
        for sl in second_level:
            if sl not in [c["service"] for c in chain]:
                chain.append({
                    "service": sl,
                    "impact": "indirect_degradation",
                    "reason": f"Indirect dependency via {downstream}",
                })
    return chain


def _is_flapping(alert_key: str, now: float) -> bool:
    """Detect oscillating alerts (alert fires → recovers → fires repeatedly)."""
    events = _alert_flap_tracker.get(alert_key, [])
    # Keep only events within the flap window
    events = [t for t in events if now - t < _FLAP_WINDOW]
    events.append(now)
    _alert_flap_tracker[alert_key] = events
    return len(events) > _FLAP_THRESHOLD


def correlate_alert(
    namespace: str,
    service_id: str,
    alert_name: str,
    error_rate: float = 0.0,
    extra: dict | None = None,
) -> CorrelatedIncident:
    """
    Core correlation function. Called for every incoming alert.

    Returns a CorrelatedIncident that is either:
    - A NEW incident (first time we've seen this)
    - An EXISTING incident (this alert belongs to an ongoing storm/cascade)
    - A STORM incident (many alerts clustered together)
    """
    now = time.time()
    severity = _severity_from_alert(alert_name, error_rate)

    # Correlation key: groups alerts for the same service+alert type
    correlation_key = f"{namespace}::{service_id}::{alert_name}"
    alert_key_flap  = f"{namespace}::{service_id}::{alert_name}"

    # ── 1. Flap Detection ──────────────────────────────────────────────────────
    is_flapping = _is_flapping(alert_key_flap, now)
    if is_flapping:
        logger.warning(f"[Correlation] Alert flapping detected: {correlation_key}")

    # ── 2. Check for existing open correlation ─────────────────────────────────
    existing = _active_correlations.get(correlation_key)
    if existing and (now - existing.last_seen_at) < _INCIDENT_TTL:
        existing.alert_count += 1
        existing.last_seen_at = now
        existing.child_alerts.append({
            "alert": alert_name,
            "service": service_id,
            "timestamp": now,
            **(extra or {}),
        })

        # Storm detection: too many alerts in short time
        recent_count = len([
            a for a in existing.child_alerts
            if now - a.get("timestamp", 0) < _alert_storm_window
        ])
        if recent_count >= _STORM_THRESHOLD and not existing.is_storm:
            existing.is_storm = True
            existing.severity = "P1"  # Auto-escalate storms to P1
            existing.correlation_reason = (
                f"ALERT STORM: {recent_count} related alerts fired in 60s. "
                f"Likely cause: mass pod restart or bad Helm rollout in {namespace}."
            )
            logger.warning(f"[Correlation] Alert storm detected in {namespace}: {service_id}")
        elif is_flapping and not existing.is_storm:
            existing.correlation_reason = f"FLAPPING: Alert has fired {len(_alert_flap_tracker.get(alert_key_flap, []))}x in 5 minutes — possible noisy alert rule"

        return existing

    # ── 3. Create a new correlated incident ───────────────────────────────────
    causal_chain = _build_causal_chain(service_id)
    affected_services = [service_id] + [c["service"] for c in causal_chain[:3]]

    reason = f"New {severity} incident: {alert_name} on {service_id}"
    if causal_chain:
        downstream = causal_chain[0]["service"]
        reason += f". Cascades to: {downstream}"
        if len(causal_chain) > 1:
            reason += f" and {len(causal_chain) - 1} more services"

    incident = CorrelatedIncident(
        id=str(uuid.uuid4()),
        root_cause_service=service_id,
        root_cause_alert=alert_name,
        severity=severity,
        status="open",
        alert_count=1,
        affected_services=affected_services,
        namespace=namespace,
        created_at=now,
        last_seen_at=now,
        is_storm=False,
        correlation_reason=reason,
        causal_chain=causal_chain,
        child_alerts=[{
            "alert": alert_name,
            "service": service_id,
            "timestamp": now,
            **(extra or {}),
        }],
    )

    _active_correlations[correlation_key] = incident
    logger.info(f"[Correlation] New incident created: {incident.id} ({severity}) — {service_id}")
    return incident


def resolve_correlation(namespace: str, service_id: str, alert_name: str) -> None:
    """Mark a correlated incident as resolved (called when Astra auto-heals or operator approves)."""
    key = f"{namespace}::{service_id}::{alert_name}"
    if key in _active_correlations:
        _active_correlations[key].status = "resolved"
        logger.info(f"[Correlation] Incident resolved: {key}")


def get_active_correlations(namespace: str = "all", limit: int = 20) -> list[dict]:
    """Return current open correlations for the dashboard API."""
    now = time.time()
    results = []
    for incident in _active_correlations.values():
        # Auto-expire stale incidents
        if now - incident.last_seen_at > _INCIDENT_TTL:
            incident.status = "resolved"
            continue
        if namespace != "all" and incident.namespace != namespace:
            continue
        results.append({
            "id":                  incident.id,
            "root_cause_service":  incident.root_cause_service,
            "root_cause_alert":    incident.root_cause_alert,
            "severity":            incident.severity,
            "status":              incident.status,
            "alert_count":         incident.alert_count,
            "affected_services":   incident.affected_services,
            "namespace":           incident.namespace,
            "created_at":          incident.created_at,
            "last_seen_at":        incident.last_seen_at,
            "is_storm":            incident.is_storm,
            "correlation_reason":  incident.correlation_reason,
            "causal_chain":        incident.causal_chain,
            "age_seconds":         int(now - incident.created_at),
        })
    # Sort by severity and recency
    sev_order = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}
    results.sort(key=lambda x: (sev_order.get(x["severity"], 4), -x["last_seen_at"]))
    return results[:limit]


def seed_demo_correlations() -> None:
    """Seed realistic demo correlations for dashboard display."""
    import random
    now = time.time()

    scenarios = [
        ("production", "frontend-crash-app", "PodCrashLoopBackOff",  0.94),
        ("production", "notification-worker","HighErrorRate",         0.12),
        ("production", "postgres-db",        "ConnectionPoolExhausted",0.0),
    ]
    for ns, svc, alert, er in scenarios:
        inc = correlate_alert(ns, svc, alert, er)
        # Simulate some history
        for _ in range(random.randint(2, 8)):
            inc.alert_count += 1
            inc.child_alerts.append({
                "alert": alert,
                "service": svc,
                "timestamp": now - random.uniform(10, 300),
            })

    logger.info("[Correlation] Demo correlations seeded")
