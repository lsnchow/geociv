"""FastAPI application entry point."""

from contextlib import asynccontextmanager
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.logging_config import setup_logging, get_logger
from app.routers import scenarios, proposals, simulate, observability, ai_chat, cache
# OLD routers disabled: chat, ai (replaced by ai_chat)

# Setup logging
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting CivicSim API...")
    await init_db()
    logger.info("Database initialized")
    yield
    # Shutdown (cleanup if needed)
    logger.info("Shutting down CivicSim API...")


settings = get_settings()

app = FastAPI(
    title="CivicSim",
    description="Kingston Civic Reaction Simulator - Predict community responses to civic proposals",
    version="0.1.0",
    lifespan=lifespan,
)

# Request timing middleware
@app.middleware("http")
async def log_request_timing(request: Request, call_next):
    """Log the time taken for each API request."""
    start_time = time.time()
    
    # Log request start
    logger.info(f"→ API_REQUEST | {request.method} {request.url.path}")
    
    response = await call_next(request)
    
    duration = time.time() - start_time
    
    # Log request completion with timing
    status_emoji = "✓" if response.status_code < 400 else "✗"
    logger.info(
        f"{status_emoji} API_RESPONSE | {request.method} {request.url.path} | "
        f"status={response.status_code} | duration={duration:.3f}s"
    )
    
    return response

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(observability.router, prefix="/v1", tags=["Observability"])
app.include_router(scenarios.router, prefix="/v1", tags=["Scenarios"])
app.include_router(proposals.router, prefix="/v1", tags=["Proposals"])
app.include_router(simulate.router, prefix="/v1", tags=["Simulation"])
app.include_router(ai_chat.router, prefix="/v1", tags=["AI Chat"])
app.include_router(cache.router, prefix="/v1", tags=["Cache"])
# OLD routers disabled until core works:
# app.include_router(chat.router, prefix="/v1", tags=["Chat"])
# app.include_router(ai.router, prefix="/v1", tags=["AI Agent"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "CivicSim",
        "version": "0.1.0",
        "description": "Kingston Civic Reaction Simulator",
    }

