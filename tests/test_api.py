"""Tests for API endpoints."""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch

from app.main import app
from app.engine.archetypes import ARCHETYPES
from app.engine.metrics import METRICS


@pytest.fixture
def client():
    """Create test client."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestObservability:
    """Tests for observability endpoints."""

    @pytest.mark.asyncio
    async def test_health(self, client):
        """Test health check endpoint."""
        async with client:
            response = await client.get("/v1/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "civicsim"

    @pytest.mark.asyncio
    async def test_metrics(self, client):
        """Test metrics endpoint."""
        async with client:
            response = await client.get("/v1/metrics")
        
        assert response.status_code == 200
        data = response.json()
        assert "metrics" in data
        assert len(data["metrics"]) == len(METRICS)

    @pytest.mark.asyncio
    async def test_archetypes(self, client):
        """Test archetypes endpoint."""
        async with client:
            response = await client.get("/v1/archetypes")
        
        assert response.status_code == 200
        data = response.json()
        assert "archetypes" in data
        assert len(data["archetypes"]) == len(ARCHETYPES)


class TestProposals:
    """Tests for proposal endpoints."""

    @pytest.mark.asyncio
    async def test_get_templates(self, client):
        """Test getting proposal templates."""
        async with client:
            response = await client.get("/v1/proposals/templates")
        
        assert response.status_code == 200
        templates = response.json()
        assert len(templates) > 0
        
        # Check template structure
        template = templates[0]
        assert "key" in template
        assert "name" in template
        assert "proposal_type" in template

    @pytest.mark.asyncio
    async def test_get_spatial_types(self, client):
        """Test getting spatial proposal types."""
        async with client:
            response = await client.get("/v1/proposals/spatial-types")
        
        assert response.status_code == 200
        data = response.json()
        assert "types" in data
        assert len(data["types"]) > 0

    @pytest.mark.asyncio
    async def test_get_citywide_types(self, client):
        """Test getting citywide proposal types."""
        async with client:
            response = await client.get("/v1/proposals/citywide-types")
        
        assert response.status_code == 200
        data = response.json()
        assert "types" in data
        assert len(data["types"]) > 0


class TestRoot:
    """Tests for root endpoint."""

    @pytest.mark.asyncio
    async def test_root(self, client):
        """Test root endpoint."""
        async with client:
            response = await client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "CivicSim"
        assert "version" in data

