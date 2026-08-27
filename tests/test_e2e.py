import pytest
import time
import subprocess
import requests
import json
import uuid

# Astra server must be running locally on 8081 for this to work
ASTRA_URL = "http://localhost:8081"
API_KEY = "change-me-in-production"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

def test_full_acceptance_e2e():
    """
    E2E Acceptance Test
    1. Deploy a crash-looping pod to 'astra-tests' namespace
    2. Wait for Prometheus to detect the crash and fire a webhook to Astra
    3. Wait for Astra to triage, investigate, and record the action
    """
    # 1. Clean up any previous runs
    print("\n[+] Cleaning up old deployments...")
    subprocess.run(
        ["kubectl", "delete", "deployment", "frontend-crash-app", "-n", "astra-tests"],
        capture_output=True
    )
    
    # 2. Deploy the crash loop app
    print("[+] Deploying crash-looping pod (frontend-crash-app) to astra-tests namespace...")
    deploy_result = subprocess.run(
        ["kubectl", "apply", "-f", "demo-cluster/k8s/crash-deployment.yaml"],
        capture_output=True, text=True
    )
    assert deploy_result.returncode == 0, f"Failed to deploy: {deploy_result.stderr}"

    print("[+] Waiting for Prometheus to detect the crash and alert Astra...")
    print("    (This can take 2-4 minutes depending on Prometheus scrape intervals)")
    
    # 3. Poll Astra's /history endpoint to wait for the workflow
    max_retries = 60 # 5 minutes
    workflow_record = None
    
    for i in range(max_retries):
        try:
            resp = requests.get(f"{ASTRA_URL}/history", headers=HEADERS)
            if resp.status_code == 200:
                history = resp.json()
                # Find the record for our crashing pod
                for record in history:
                    if "frontend-crash-app" in record.get("pod", ""):
                        workflow_record = record
                        break
        except requests.exceptions.ConnectionError:
            pytest.fail("Astra is not running on localhost:8081. Start it with `python -m app.main`")
            
        if workflow_record and workflow_record.get("status") in ["resolved", "paused"]:
            break
            
        time.sleep(5)
        print(f"    ... waiting ({i*5}s)")

    assert workflow_record is not None, "Prometheus never alerted Astra, or Astra never received it."
    
    print("\n[+] Astra completed the workflow!")
    print(json.dumps(workflow_record, indent=2))
    
    # 4. Assert correctness
    assert workflow_record["status"] in ["resolved", "paused"]
    
    # It should have identified the issue (OOM / Crash)
    diagnosis = workflow_record["diagnosis"].lower()
    assert any(word in diagnosis for word in ["oom", "crash", "memory", "137", "kill"])
    
    print("[+] E2E Acceptance Test Passed Successfully!")
    
    # Clean up
    subprocess.run(
        ["kubectl", "delete", "deployment", "frontend-crash-app", "-n", "astra-tests"],
        capture_output=True
    )
