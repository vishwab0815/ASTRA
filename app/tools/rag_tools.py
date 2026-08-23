from langchain_core.tools import tool
from app.services.rag import search_runbooks
import logging

logger = logging.getLogger(__name__)

@tool("search_company_runbooks")
def search_company_runbooks(query: str) -> str:
    """
    Search the company's historical wiki, previous Slack outages, and runbooks
    to find how similar issues were resolved in the past.
    
    Use this tool whenever you see a specific error message, crash loop, or
    stack trace during your investigation. Convert raw stack traces into human
    keywords before searching (e.g., search 'OutOfMemory Java' instead of 
    'java.lang.OutOfMemoryError: Java heap space').
    
    Args:
        query: A short, 3-5 word phrase describing the problem (e.g. 'auth-service OOM CrashLoopBackOff')
    """
    logger.info(f"Agent is searching runbooks for: '{query}'")
    
    results = search_runbooks(query)
    
    if not results or "No relevant historical runbooks found" in results[0]:
        return "No historical runbooks found for this query. Proceed with standard troubleshooting."
        
    formatted_results = "\n\n---\n\n".join(results)
    return f"Found the following historical runbooks/context:\n\n{formatted_results}"
