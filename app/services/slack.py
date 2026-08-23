"""
Astra — Slack Notification Service

Sends Human-in-the-Loop (HITL) approval requests to a Slack channel
when the agent's confidence is below the configured threshold.

Setup:
  1. Create a Slack App at https://api.slack.com/apps
  2. Add the "chat:write" OAuth scope
  3. Install the app to your workspace
  4. Copy the Bot User OAuth Token → SLACK_BOT_TOKEN in .env
  5. Invite the bot to your channel: /invite @astra-bot
  6. Copy the Channel ID → SLACK_CHANNEL_ID in .env

If Slack is not configured (tokens empty), notifications are skipped
and a warning is logged — the workflow continues normally.
"""

import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


def _is_slack_configured() -> bool:
    """Return True only if both Slack credentials are set."""
    return bool(settings.slack_bot_token and settings.slack_channel_id)


def send_hitl_request(
    thread_id: str,
    alert_name: str,
    pod: str,
    namespace: str,
    diagnosis: str,
    severity: str,
    tool: str,
    confidence: float,
    api_base_url: str = "http://localhost:8000",
) -> None:
    """
    Post a Human-in-the-Loop approval request to Slack.

    The message includes all the information an SRE needs to make a decision,
    plus the exact curl command to approve or deny.

    Args:
        thread_id:    The Astra workflow thread to resume or abort.
        alert_name:   The Kubernetes alert name.
        pod:          Affected pod name.
        namespace:    Kubernetes namespace.
        diagnosis:    Agent's diagnosis of the problem.
        severity:     high | medium | low
        tool:         The remediation tool the agent wants to run.
        confidence:   Agent's confidence score (0.0–1.0).
        api_base_url: Base URL of the Astra API for the curl examples.
    """
    if not _is_slack_configured():
        logger.warning(
            "Slack not configured — HITL notification skipped. "
            "Set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID in .env to enable."
        )
        return

    try:
        from slack_sdk import WebClient
        from slack_sdk.errors import SlackApiError
    except ImportError:
        logger.error("slack-sdk is not installed. Run: pip install slack-sdk")
        return

    severity_emoji = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(severity, "⚪")
    approve_cmd = (
        f'curl -X POST {api_base_url}/threads/{thread_id}/approve \\\n'
        f'     -H "Content-Type: application/json" \\\n'
        f'     -d \'{{"approved": true}}\''
    )
    deny_cmd = (
        f'curl -X POST {api_base_url}/threads/{thread_id}/approve \\\n'
        f'     -H "Content-Type: application/json" \\\n'
        f'     -d \'{{"approved": false}}\''
    )

    # Slack Block Kit message — structured for readability in Slack
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "🤖 Astra — Human Approval Required"},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Alert:*\n{alert_name}"},
                {"type": "mrkdwn", "text": f"*Pod:*\n`{pod}`"},
                {"type": "mrkdwn", "text": f"*Namespace:*\n`{namespace}`"},
                {"type": "mrkdwn", "text": f"*Severity:*\n{severity_emoji} {severity.upper()}"},
            ],
        },
        {"type": "divider"},
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Diagnosis:*\n{diagnosis}",
            },
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Proposed Fix:*\n`{tool}`"},
                {"type": "mrkdwn", "text": f"*Confidence:*\n{confidence:.0%}"},
            ],
        },
        {"type": "divider"},
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*To approve* (execute the fix):\n```{approve_cmd}```\n"
                    f"*To deny* (abort the workflow):\n```{deny_cmd}```"
                ),
            },
        },
    ]

    client = WebClient(token=settings.slack_bot_token)
    try:
        client.chat_postMessage(channel=settings.slack_channel_id, blocks=blocks)
        logger.info(
            "Slack HITL notification sent",
            extra={"thread_id": thread_id, "channel": settings.slack_channel_id},
        )
    except SlackApiError as exc:
        logger.error(
            f"Failed to send Slack notification: {exc.response['error']}",
            extra={"thread_id": thread_id},
        )
