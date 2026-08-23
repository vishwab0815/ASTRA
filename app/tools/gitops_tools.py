import os
import subprocess
import logging

logger = logging.getLogger(__name__)

def gitops_patch(pod: str, namespace: str = "default") -> str:
    """
    Simulates a GitOps remediation workflow (e.g. for ArgoCD or Flux).
    Instead of imperatively modifying the live cluster, this creates a Git Pull Request.
    
    Since this is a local prototype, it creates a new local git branch, 
    commits a simulated patch to the deployment YAML, and returns the branch info.
    """
    branch_name = f"astra-fix-{pod}"
    
    try:
        # Check if git is initialized
        if not os.path.exists(".git"):
            subprocess.run(["git", "init"], check=True, capture_output=True)
            subprocess.run(["git", "add", "."], check=True, capture_output=True)
            subprocess.run(["git", "commit", "-m", "Initial commit"], check=True, capture_output=True)
            
        # Create and checkout new branch
        subprocess.run(["git", "checkout", "-b", branch_name], check=True, capture_output=True)
        
        # Simulate patching the YAML file
        yaml_path = "demo-cluster/k8s/deployment.yaml"
        if os.path.exists(yaml_path):
            with open(yaml_path, "r") as f:
                content = f.read()
            
            # Simple simulation: double the memory limit in the yaml
            # In a real scenario, this would use a proper YAML parser or kustomize
            if "memory: 256Mi" in content:
                new_content = content.replace("memory: 256Mi", "memory: 512Mi")
            else:
                new_content = content + f"\n# ASTRA GITOPS PATCH: Memory increased for {pod}\n"
                
            with open(yaml_path, "w") as f:
                f.write(new_content)
                
            # Commit the change
            subprocess.run(["git", "add", yaml_path], check=True, capture_output=True)
            subprocess.run(["git", "commit", "-m", f"Astra GitOps: Patch resources for {pod}"], check=True, capture_output=True)
            
            # Return back to main to keep things clean locally
            subprocess.run(["git", "checkout", "main"], check=False, capture_output=True)
            # fallback if main doesn't exist (e.g. default branch is master)
            subprocess.run(["git", "checkout", "master"], check=False, capture_output=True)
            
            return (
                f"✅ GitOps Remediation Successful!\n"
                f"Created local branch '{branch_name}' and committed a patch for {pod}.\n"
                f"In production, this would open a Pull Request for human review."
            )
        else:
            return f"❌ GitOps Error: Could not find {yaml_path} to patch."
            
    except subprocess.CalledProcessError as e:
        logger.error(f"GitOps tool failed: {e.stderr.decode()}")
        return f"❌ GitOps Error: Failed to execute git commands: {e.stderr.decode()}"
    except Exception as e:
        logger.error(f"GitOps tool exception: {str(e)}")
        return f"❌ GitOps Error: {str(e)}"
