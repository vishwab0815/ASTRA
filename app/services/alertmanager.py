"""
Astra — Prometheus Alertmanager Payload Parser

Prometheus Alertmanager sends alerts in a specific JSON structure
that differs from our internal AlertPayload format.

This module converts the Alertmanager format into the format
Astra's agent expects, so the rest of the system stays decoupled
from the Prometheus wire format.

Alertmanager webhook format:
  https://prometheus.io/docs/alerting/latest/configuration/#webhook_config
"""

import logging
from app.api.schemas import AlertPayload

logger = logging.getLogger(__name__)


def parse_alertmanager_payload(payload: dict) -> list[AlertPayload]:
    """
    Convert a Prometheus Alertmanager webhook body into a list of AlertPayloads.

    Alertmanager can batch multiple alerts in one webhook call ("alerts" array).
    We return one AlertPayload per alert so each gets its own Astra workflow.

    Example Alertmanager body:
    {
      "status": "firing",
      "alerts": [
        {
          "status": "firing",
          "labels": {
            "alertname": "PodCrashLoopBackOff",
            "pod":       "auth-service-7d9f8c",
            "namespace": "production",
            "severity":  "critical"
          },
          "annotations": {
            "description": "Pod has restarted 5 times in the last 10 minutes"
          }
        }
      ]
    }
    """
    alerts = payload.get("alerts", [])
    result = []

    for raw_alert in alerts:
        # Only process firing alerts — ignore resolved notifications
        if raw_alert.get("status") != "firing":
            continue

        labels = raw_alert.get("labels", {})
        annotations = raw_alert.get("annotations", {})

        alert_name = labels.get("alertname", "UnknownAlert")
        pod        = labels.get("pod", "unknown-pod")
        namespace  = labels.get("namespace", "default")

        # Pass through all labels as extra context the agent can reference
        extra_context = {**labels, **annotations}
        extra_context.pop("alertname", None)
        extra_context.pop("pod", None)
        extra_context.pop("namespace", None)

        alert = AlertPayload(
            alert=alert_name,
            pod=pod,
            namespace=namespace,
            **extra_context,
        )
        result.append(alert)
        logger.info(
            "Parsed Alertmanager alert",
            extra={"alert": alert_name, "pod": pod, "namespace": namespace},
        )

    return result
