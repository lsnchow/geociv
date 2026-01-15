# CivicSim - Kingston Civic Reaction Simulator

A simulation backend that predicts how different community archetypes react to proposed spatial changes or citywide policies.

## Features

- **Archetype-based modeling**: 10 distinct community archetypes with socioeconomic diversity
- **Dual proposal types**: Spatial (buildings, parks) and citywide (taxes, subsidies)
- **Distance-decay exposure**: Realistic modeling of how proximity affects community reactions
- **Explainable outputs**: Clear breakdown of what drives approval/opposition
- **Chat integration**: Natural language proposal input via Backboard API

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 14+
- Backboard API key (for chat features)

### Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL and Backboard API key

# Initialize database
alembic upgrade head

# Run the server
uvicorn app.main:app --reload
```

### API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API Endpoints

### Scenarios
- `POST /v1/scenario/create` - Create a new scenario
- `GET /v1/scenario/{id}` - Get scenario details

### Proposals
- `GET /v1/proposals/templates` - List available proposal templates
- `POST /v1/proposal/parse` - Parse natural language to structured proposal

### Simulation
- `POST /v1/simulate` - Run simulation and get results

### Chat
- `POST /v1/chat/message` - Send message for chat-based interaction

### Observability
- `GET /v1/health` - Health check
- `GET /v1/metrics` - List metric definitions
- `GET /v1/archetypes` - List archetype definitions

## Architecture

```
app/
├── main.py           # FastAPI application
├── config.py         # Settings management
├── database.py       # PostgreSQL connection
├── models/           # SQLAlchemy models
├── schemas/          # Pydantic validation
├── engine/           # Simulation core
├── routers/          # API endpoints
└── services/         # External integrations
```

## Archetypes

1. Low-income renter
2. Middle-income homeowner
3. High-income professional
4. University student
5. Senior on fixed income
6. Small business owner
7. Industrial worker
8. Developer/builder
9. Environmental advocate
10. Young family

## Metrics

| Metric | Description |
|--------|-------------|
| Affordability | Cost of living impact |
| Housing | Supply and availability |
| Mobility | Transit and commute burden |
| Environment | Green space and emissions |
| Economy | Jobs and business vitality |
| Equity | Distributional fairness |

## License

MIT

