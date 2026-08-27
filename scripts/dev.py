#!/usr/bin/env python3
"""
Astra — Developer Setup & Management Script

Run this script to perform common development tasks without needing
to type out long uvicorn or kubectl commands manually.

Usage:
    python scripts/dev.py start        # Start the Astra backend server
    python scripts/dev.py test         # Run the test suite
    python scripts/dev.py clean        # Remove all generated databases and cache
    python scripts/dev.py check        # Verify the environment is configured correctly
"""

import os
import sys
import subprocess
import argparse
import shutil

# ── Constants ──────────────────────────────────────────────────────────────────

PROJECT_ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV_PYTHON   = os.path.join(PROJECT_ROOT, "venv", "Scripts", "python.exe")
GENERATED_FILES = [
    "astra_audit.db",
    "astra_audit.db-shm",
    "astra_audit.db-wal",
    "astra_checkpoints.db",
    "astra_checkpoints.db-shm",
    "astra_checkpoints.db-wal",
]


def _run(cmd: list[str], **kwargs) -> int:
    """Run a subprocess command and return its exit code."""
    print(f"\n[astra dev] Running: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, cwd=PROJECT_ROOT, **kwargs)
    return result.returncode


def cmd_start(args) -> int:
    """Start the Astra backend server in development mode."""
    port = getattr(args, "port", 8081)
    print(f"[astra dev] Starting Astra on http://127.0.0.1:{port}")
    print(f"[astra dev] Swagger UI: http://127.0.0.1:{port}/docs")
    print(f"[astra dev] Metrics:    http://127.0.0.1:{port}/metrics")
    print(f"[astra dev] Press CTRL+C to stop.\n")
    return _run([
        VENV_PYTHON, "-m", "uvicorn", "app.main:app",
        "--host", "127.0.0.1",
        "--port", str(port),
        "--reload",
    ])


def cmd_test(args) -> int:
    """Run the pytest test suite."""
    return _run([VENV_PYTHON, "-m", "pytest", "tests/", "-v"])


def cmd_clean(args) -> int:
    """Remove all generated database files and Python cache directories."""
    print("[astra dev] Cleaning generated files...")

    for filename in GENERATED_FILES:
        path = os.path.join(PROJECT_ROOT, filename)
        if os.path.exists(path):
            os.remove(path)
            print(f"  Removed: {filename}")

    for root, dirs, _ in os.walk(PROJECT_ROOT):
        for d in dirs:
            if d == "__pycache__" or d == ".pytest_cache":
                full = os.path.join(root, d)
                shutil.rmtree(full)
                print(f"  Removed: {os.path.relpath(full, PROJECT_ROOT)}")

    print("\n[astra dev] Clean complete.")
    return 0


def cmd_check(args) -> int:
    """Verify the environment and .env configuration."""
    issues = []

    # Check venv
    if not os.path.exists(VENV_PYTHON):
        issues.append("  [FAIL] Virtual environment not found. Run: python -m venv venv")
    else:
        print("  [OK]   Virtual environment found.")

    # Check .env
    env_path = os.path.join(PROJECT_ROOT, ".env")
    if not os.path.exists(env_path):
        issues.append("  [FAIL] .env file not found. Copy .env.example to .env and fill in your keys.")
    else:
        with open(env_path) as f:
            content = f.read()
        if "GROQ_API_KEY" not in content or 'GROQ_API_KEY=""' in content:
            issues.append("  [WARN] GROQ_API_KEY is not set in .env — the LLM will not work.")
        else:
            print("  [OK]   GROQ_API_KEY is set.")

    # Check kubectl
    if shutil.which("kubectl"):
        print("  [OK]   kubectl is installed.")
    else:
        issues.append("  [WARN] kubectl not found — Kubernetes tools will use mock responses.")

    if issues:
        print("\nIssues found:")
        for i in issues:
            print(i)
        return 1

    print("\n[astra dev] All checks passed. Run 'python scripts/dev.py start' to launch Astra.")
    return 0


# ── Entrypoint ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="python scripts/dev.py",
        description="Astra developer management script."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # start
    p_start = subparsers.add_parser("start", help="Start the Astra backend server")
    p_start.add_argument("--port", type=int, default=8081, help="Port to run on (default: 8081)")
    p_start.set_defaults(func=cmd_start)

    # test
    p_test = subparsers.add_parser("test", help="Run the test suite")
    p_test.set_defaults(func=cmd_test)

    # clean
    p_clean = subparsers.add_parser("clean", help="Remove generated databases and cache")
    p_clean.set_defaults(func=cmd_clean)

    # check
    p_check = subparsers.add_parser("check", help="Verify environment configuration")
    p_check.set_defaults(func=cmd_check)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
