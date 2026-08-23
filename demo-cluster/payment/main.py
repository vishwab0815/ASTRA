from fastapi import FastAPI, HTTPException
import time
import logging
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

# Configure OpenTelemetry Tracing
resource = Resource(attributes={"service.name": "payment-service"})
provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(OTLPSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("payment-service")

app = FastAPI(title="Payment Service")

# Instrument the FastAPI app for OpenTelemetry
FastAPIInstrumentor.instrument_app(app)

@app.get("/health")
def health_check():
    """Kubernetes Liveness Probe Endpoint"""
    return {"status": "healthy"}

@app.post("/pay")
def process_payment(trigger_bug: bool = False):
    """
    Processes a payment.
    If trigger_bug is True, it simulates a massive failure (database lock/timeout).
    """
    logger.info(f"Processing payment request. trigger_bug={trigger_bug}")
    
    if trigger_bug:
        logger.error("CRITICAL: Database lock detected! Sleeping indefinitely to simulate frozen process...")
        # Simulate a process that hangs forever, causing a timeout and a liveness probe failure
        time.sleep(60) 
        raise HTTPException(status_code=500, detail="Database connection timeout")
        
    return {"status": "success", "transaction_id": "txn_12345"}
