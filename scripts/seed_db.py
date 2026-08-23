import os
import sys

# Add the root directory to PYTHONPATH so we can import from app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.rag import get_vector_store

def main():
    print("Connecting to ChromaDB and initializing embedding model...")
    store = get_vector_store()
    
    runbooks = [
        {
            "id": "runbook-001",
            "content": (
                "INCIDENT: auth-service memory leak.\n"
                "SYMPTOMS: PodCrashLoopBackOff, Error 137, OutOfMemoryError, OOMKilled.\n"
                "ROOT CAUSE: A memory leak in the JWT validation library causes the auth-service to exhaust its 256Mi memory limit during high load.\n"
                "RESOLUTION: Increase the memory limit to 512Mi (scale_resources) and restart the pod. Engineering ticket AUTH-104 is tracking the permanent code fix."
            )
        },
        {
            "id": "runbook-002",
            "content": (
                "INCIDENT: payment-gateway Redis timeout.\n"
                "SYMPTOMS: RedisConnectionException, Error 503, Connection refused.\n"
                "ROOT CAUSE: The Redis pod was evicted due to node disk pressure, causing the payment-gateway to fail to connect.\n"
                "RESOLUTION: Restart the payment-gateway pod to force it to reconnect to the new Redis IP address."
            )
        },
        {
            "id": "runbook-003",
            "content": (
                "INCIDENT: frontend-app ImagePullBackOff.\n"
                "SYMPTOMS: ErrImagePull, 401 Unauthorized from registry.\n"
                "ROOT CAUSE: The Kubernetes docker-registry secret expired, preventing the node from pulling the latest frontend image.\n"
                "RESOLUTION: check_image tool should be run. A human must rotate the registry credentials in Vault."
            )
        }
    ]
    
    print("Seeding runbooks...")
    
    texts = [r["content"] for r in runbooks]
    ids = [r["id"] for r in runbooks]
    
    store.add_texts(texts=texts, ids=ids)
    
    print("Successfully seeded 3 historical runbooks into ChromaDB!")

if __name__ == "__main__":
    main()
