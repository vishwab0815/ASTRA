"""
Astra — Triage & Deduplication Engine

This module implements Phase 1 of the Enterprise Master Plan: Alert Triage.
When a storm of alerts fires for the same underlying workload (e.g., 50 pods
in a Deployment crashing simultaneously), we group them and suppress duplicates
within a time window.
"""

import re
import logging
from app.api.schemas import AlertPayload
from app.db.database import check_and_update_triage_cache

logger = logging.getLogger(__name__)

# Matches standard Kubernetes suffixes:
# - Deployment: -<rs-hash>-<pod-hash> (e.g. -745bf9d8f9-zxq2a)
# - StatefulSet: -<index> (e.g. -0, -1)
# - DaemonSet/Job: -<hash> (e.g. -xyz12)
WORKLOAD_SUFFIX_PATTERN = re.compile(r"(-[a-f0-9]{8,10}-[a-z0-9]{5}|-[a-z0-9]{5}|-\d+)$")


def extract_workload_name(pod_name: str) -> str:
    """
    Strips Kubernetes-generated hashes/indices from a pod name to find the base workload name.
    Example: "payment-service-745bf9d8f9-zxq2a" -> "payment-service"
    """
    return WORKLOAD_SUFFIX_PATTERN.sub("", pod_name)


def should_triage_suppress(alert: AlertPayload, db_path: str, window_minutes: int = 5) -> bool:
    """
    Evaluates whether an alert is part of an ongoing incident storm.
    Returns True if the alert should be suppressed.
    """
    workload_name = extract_workload_name(alert.pod)
    
    # The deduplication key identifies the unique "incident"
    dedup_key = f"{alert.namespace}::{workload_name}::{alert.alert}"
    
    is_duplicate = check_and_update_triage_cache(db_path, dedup_key, window_minutes)
    
    if is_duplicate:
        logger.info(
            f"Alert Triage: Suppressed duplicate alert '{alert.alert}' for workload '{workload_name}' in namespace '{alert.namespace}'."
        )
    else:
        logger.info(
            f"Alert Triage: New incident detected '{alert.alert}' for workload '{workload_name}'. Starting investigation."
        )
        
    return is_duplicate
