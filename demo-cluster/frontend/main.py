from fastapi import FastAPI, HTTPException
import httpx
import logging
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

# Configure OpenTelemetry Tracing
resource = Resource(attributes={"service.name": "frontend-service"})
provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(OTLPSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("frontend-service")

app = FastAPI(title="Frontend Service")

# Instrument FastAPI and HTTPX to propagate the Trace ID automatically!
FastAPIInstrumentor.instrument_app(app)
HTTPXClientInstrumentor().instrument()

PAYMENT_SERVICE_URL = "http://payment-service:8080"

@app.get("/health")
def health_check():
    """Kubernetes Liveness Probe Endpoint"""
    return {"status": "healthy"}

@app.get("/checkout")
async def checkout(trigger_bug: bool = False):
    """
    Simulates a user checkout flow.
    Calls the downstream payment service to process the transaction.
    """
    logger.info(f"Received checkout request. Routing to payment gateway... trigger_bug={trigger_bug}")
    
    try:
        # 10 second timeout. If the payment gateway freezes, this will throw an error
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{PAYMENT_SERVICE_URL}/pay", 
                params={"trigger_bug": trigger_bug}
            )
            response.raise_for_status()
            
            logger.info("Payment successful!")
            return {"status": "success", "message": "Checkout complete!", "payment_data": response.json()}
            
    except httpx.ReadTimeout:
        logger.error("CRITICAL: Payment Gateway timed out! Checkout failed.")
        raise HTTPException(status_code=504, detail="Gateway Timeout - Payment Service is unresponsive")
    except httpx.HTTPError as e:
        logger.error(f"CRITICAL: Payment Gateway returned error: {e}")
        raise HTTPException(status_code=502, detail="Bad Gateway - Payment Service failed")
