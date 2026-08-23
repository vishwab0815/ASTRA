import httpx
import logging

logger = logging.getLogger(__name__)

# If running locally, port-forward 16686. If running in-cluster, use http://jaeger:16686
JAEGER_API_URL = "http://localhost:16686/api/traces"

def analyze_traces(pod: str, namespace: str = "default") -> str:
    """
    Fetches the most recent distributed traces from Jaeger for a given pod.
    Analyzes the spans to identify slow downstream calls, timeouts, or HTTP 500 errors.
    
    Used by the ReAct investigate loop when a pod is healthy but users report latency or timeouts.
    """
    # Map a pod name like 'frontend-app-6bd5dd89b4-rjr6c' to Jaeger service name 'frontend-service'
    service_name = pod.split("-app-")[0] + "-service" if "-app-" in pod else pod
    
    logger.info(f"Querying Jaeger traces for service: {service_name} (from pod {pod})")
    
    try:
        response = httpx.get(
            f"{JAEGER_API_URL}",
            params={"service": service_name, "limit": 5},
            timeout=5.0
        )
        response.raise_for_status()
        data = response.json()
        
        traces = data.get("data", [])
        if not traces:
            return f"ℹ️ No recent traces found for '{service_name}' in Jaeger."
            
        summary = [f"📊 Found {len(traces)} recent traces for {service_name}:\n"]
        
        for trace in traces:
            trace_id = trace.get("traceID")
            spans = trace.get("spans", [])
            
            # Find the longest span (usually the root)
            max_duration = max([s.get("duration", 0) for s in spans], default=0)
            duration_sec = max_duration / 1_000_000.0
            
            # Look for errors in tags
            has_error = False
            error_details = []
            
            for span in spans:
                process_id = span.get("processID")
                process = trace.get("processes", {}).get(process_id, {})
                span_service = process.get("serviceName", "unknown")
                
                tags = span.get("tags", [])
                for tag in tags:
                    if tag.get("key") == "error" and tag.get("value") is True:
                        has_error = True
                        error_details.append(f"[{span_service}] Span '{span.get('operationName')}' failed!")
                    
                    if tag.get("key") == "http.status_code" and tag.get("value") >= 500:
                        has_error = True
                        error_details.append(f"[{span_service}] Returned HTTP {tag.get('value')}")
            
            status = "❌ ERROR" if has_error else "✅ SUCCESS"
            summary.append(f"Trace ID: {trace_id} | Total Duration: {duration_sec:.2f}s | Status: {status}")
            for err in error_details:
                summary.append(f"  -> {err}")
                
        return "\n".join(summary)
        
    except httpx.RequestError as exc:
        return f"⚠️ Failed to connect to Jaeger API: {exc}. Is Jaeger running and port-forwarded?"
    except Exception as exc:
        return f"❌ Error analyzing traces: {exc}"
