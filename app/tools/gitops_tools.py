"""
Astra — GitOps Remediation Tool

Implements a GitOps-style workflow instead of running imperative kubectl commands.

In production this would:
  1. Clone the company's GitOps repository
  2. Parse the YAML using a proper parser (e.g. ruamel.yaml)
  3. Apply the patch
  4. Push the branch
  5. Open a GitHub/GitLab Pull Request via API

For local development, it simulates this by:
  1. Creating a git branch in the current repo
  2. Patching demo-cluster/k8s/deployment.yaml using a proper YAML parser
  3. Committing the patch locally
  4. Returning the branch name for manual review

Design decisions:
  - Uses 'ruamel.yaml' to parse/write YAML so comments and formatting are preserved.
  - Falls back to pure-string patching if ruamel.yaml is not installed (with a warning).
  - Checks if the branch already exists before creating it; if so, deletes it first to
    ensure each run produces a clean, reviewable diff.
  - All git commands are called via subprocess with explicit error capture.
"""

import os
import re
import subprocess
import logging

logger = logging.getLogger(__name__)

# The YAML file we patch in local development
_DEPLOYMENT_YAML = "demo-cluster/k8s/deployment.yaml"


def _get_current_branch() -> str:
    """Return the current git branch name (or 'main' as a safe default)."""
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True, text=True
    )
    return result.stdout.strip() if result.returncode == 0 else "main"


def _branch_exists(branch_name: str) -> bool:
    """Check whether a local git branch already exists."""
    result = subprocess.run(
        ["git", "branch", "--list", branch_name],
        capture_output=True, text=True
    )
    return bool(result.stdout.strip())


def _patch_yaml(content: str, pod: str) -> tuple[str, str]:
    """
    Parse the YAML and apply a resource patch.

    Strategy:
      1. Try to use ruamel.yaml (preserves comments and formatting — preferred).
      2. Fall back to a safe regex replacement if ruamel.yaml is not installed.

    Returns:
      (patched_content, description_of_change)
    """
    try:
        from ruamel.yaml import YAML
        from io import StringIO

        yaml = YAML()
        yaml.preserve_quotes = True

        # load_all handles multi-document YAML files (separated by ---)
        docs = list(yaml.load_all(content))

        # Walk every document in the file looking for Deployment resource limits
        changed      = False
        description  = ""
        for data in docs:
            if not isinstance(data, dict):
                continue
            for item in (data.get("spec", {}).get("template", {})
                         .get("spec", {}).get("containers", [])):
                resources = item.get("resources", {}) or {}
                limits    = resources.get("limits", {}) or {}
                if "memory" in limits:
                    old_val = limits["memory"]
                    match   = re.match(r"^(\d+)(Mi|Gi)$", str(old_val))
                    if match:
                        new_num      = int(match.group(1)) * 2
                        new_val      = f"{new_num}{match.group(2)}"
                        limits["memory"] = new_val
                        changed      = True
                        description  = f"memory limit: {old_val} -> {new_val}"

        if changed:
            buf = StringIO()
            yaml.dump_all(docs, buf)
            return buf.getvalue(), description

    except ImportError:
        logger.warning(
            "ruamel.yaml is not installed. Falling back to regex patching. "
            "Run 'pip install ruamel.yaml' for safer YAML editing."
        )

    # ── Regex fallback ────────────────────────────────────────────────────────
    # Matches 'memory: <number>Mi' and doubles the value
    def double_memory(m: re.Match) -> str:
        old_num = int(m.group(1))
        return f"memory: {old_num * 2}Mi"

    new_content, count = re.subn(r"memory:\s+(\d+)Mi", double_memory, content)
    if count:
        return new_content, "memory limits doubled via regex patch"

    # Nothing to patch — append a comment so the commit is not empty
    comment = f"\n# ASTRA GITOPS PATCH: Investigated {pod} — no patchable resource limits found\n"
    return content + comment, "appended investigation comment (no numeric memory limits found)"


def gitops_patch(pod: str, namespace: str = "default") -> str:
    """
    Create a GitOps Pull Request (simulated locally) to permanently fix a pod's
    resource configuration instead of imperatively modifying the live cluster.

    In a real enterprise deployment, this function would push the branch to GitHub/GitLab
    and call the Pull Request API. Here, it creates a local branch for review.

    Args:
        pod:       The name of the Kubernetes pod that triggered the alert.
        namespace: The Kubernetes namespace (informational only in local mode).

    Returns:
        A human-readable string describing the result of the GitOps operation.
    """
    branch_name    = f"astra/fix-resources-{pod}"
    original_branch = _get_current_branch()

    try:
        # ── Guard: ensure git repo exists ─────────────────────────────────────
        if not os.path.exists(".git"):
            return (
                "❌ GitOps Error: No git repository found in the current directory. "
                "Initialise one with 'git init' before using gitops_patch."
            )

        # ── Guard: ensure the YAML file exists ────────────────────────────────
        if not os.path.exists(_DEPLOYMENT_YAML):
            return (
                f"❌ GitOps Error: Could not find '{_DEPLOYMENT_YAML}'. "
                "Ensure the demo cluster manifests are present."
            )

        # ── Clean up stale branch if it already exists ────────────────────────
        # This prevents 'fatal: branch already exists' on repeated runs.
        if _branch_exists(branch_name):
            logger.info(f"GitOps: Branch '{branch_name}' already exists — deleting it for a clean run.")
            subprocess.run(["git", "branch", "-D", branch_name], check=True, capture_output=True)

        # ── Create and switch to the patch branch ─────────────────────────────
        subprocess.run(["git", "checkout", "-b", branch_name], check=True, capture_output=True)

        # ── Apply the YAML patch ───────────────────────────────────────────────
        with open(_DEPLOYMENT_YAML, "r", encoding="utf-8") as f:
            original_content = f.read()

        patched_content, change_description = _patch_yaml(original_content, pod)

        with open(_DEPLOYMENT_YAML, "w", encoding="utf-8") as f:
            f.write(patched_content)

        # ── Commit the patch ───────────────────────────────────────────────────
        commit_message = (
            f"fix(astra): patch resources for {pod}\n\n"
            f"Change: {change_description}\n"
            f"Namespace: {namespace}\n"
            f"Triggered by: Astra AIOps Engine (automated remediation)\n"
        )
        subprocess.run(["git", "add", _DEPLOYMENT_YAML], check=True, capture_output=True)
        subprocess.run(["git", "commit", "-m", commit_message], check=True, capture_output=True)

        # ── Return to the original branch ─────────────────────────────────────
        subprocess.run(["git", "checkout", original_branch], check=False, capture_output=True)

        logger.info(
            "GitOps patch committed successfully",
            extra={"branch": branch_name, "pod": pod, "change": change_description}
        )

        return (
            "GitOps Remediation Successful!\n"
            f"Branch   : {branch_name}\n"
            f"Change   : {change_description}\n"
            "Next step: In production, this branch would be pushed and a Pull Request\n"
            "           opened for a Senior Engineer to review and merge.\n"
            "           Your CI/CD pipeline (ArgoCD/Flux) would then sync the fix to the cluster."
        )

    except subprocess.CalledProcessError as exc:
        # Ensure we always return to the original branch even on git errors
        subprocess.run(["git", "checkout", original_branch], check=False, capture_output=True)
        if isinstance(exc.stderr, bytes):
            stderr = exc.stderr.decode(errors="replace")
        elif isinstance(exc.stderr, str):
            stderr = exc.stderr
        else:
            stderr = "no stderr"
        logger.error(f"GitOps git command failed: {stderr}", extra={"pod": pod})
        return f"[ERROR] GitOps Error: A git command failed: {stderr}"

    except Exception as exc:
        subprocess.run(["git", "checkout", original_branch], check=False, capture_output=True)
        logger.error(f"GitOps unexpected error: {exc}", extra={"pod": pod})
        return f"[ERROR] GitOps Error: {type(exc).__name__}: {exc}"
