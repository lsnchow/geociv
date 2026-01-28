"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routers import scenarios, proposals, simulate, observability
# OLD routers disabled: chat, ai, ai_chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    await init_db()
    yield
    # Shutdown (cleanup if needed)


settings = get_settings()

app = FastAPI(
    title="CivicSim",
    description="Kingston Civic Reaction Simulator - Predict community responses to civic proposals",
    version="0.1.0",
    lifespan=lifespan,
)

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

