"""
Astra — Application Settings

All configuration is driven by environment variables or a .env file.
Add new settings here; never hardcode values in application code.
"""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):

    # ── Security ─────────────────────────────────────────────────────────────
    astra_api_key: str = Field(
        default="change-me-in-production",
        description="API key required to call Astra webhooks",
    )

    # ── LLM ──────────────────────────────────────────────────────────────────
    groq_api_key: str = Field(default="", description="Groq API key")
    llm_model: str    = Field(
        default="llama-3.1-8b-instant",
        description="Groq model to use for all LLM calls",
    )

    # ── Agent Behaviour ───────────────────────────────────────────────────────
    confidence_threshold: float = Field(
        default=0.75, ge=0.0, le=1.0,
        description="Minimum confidence score to auto-execute a remediation. "
                    "Below this the workflow pauses for human approval.",
    )
    dry_run: bool = Field(
        default=True,
        description="When True, write K8s operations are simulated and logged "
                    "instead of being applied to the cluster.",
    )
    max_investigation_rounds: int = Field(
        default=3,
        description="Maximum number of diagnostic tool calls in the ReAct "
                    "investigation loop before the agent is forced to conclude.",
    )
    max_concurrent_workflows: int = Field(
        default=10,
        description="Maximum number of LLM investigations that can run simultaneously. "
                    "Additional alerts are queued and processed as slots free up. "
                    "Prevents Groq API rate limits when a large alert storm hits.",
    )

    # ── Slack (HITL Notifications) ────────────────────────────────────────────
    slack_bot_token: str    = Field(default="", description="Slack bot OAuth token")
    slack_channel_id: str   = Field(default="", description="Slack channel to post HITL alerts")

    # ── Database (Audit Trail) ────────────────────────────────────────────────
    audit_db_path: str = Field(
        default="astra_audit.db",
        description="Path to the SQLite audit database (auto-created on startup)",
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
# Trigger reload
