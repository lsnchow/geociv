# CivicSim - Kingston Civic Reaction Simulator

CivicSim is a simulation and decision-support tool for exploring how Kingston community archetypes react to spatial builds and citywide policy proposals. It pairs a deterministic impact engine with a multi-agent town hall layer for explainable results and roleplay-style feedback.

## Key Features

- Scenario-based simulation with archetype distributions and per-cluster baselines
- Spatial and citywide proposal templates with explainable metric deltas
- Multi-agent "town hall" flow with reactions, zone sentiment, and transcripts
- Build mode and map-first UX for placing proposals on Kingston zones
- Scenario seeding for a ready-to-run Kingston demo dataset

## Tech Stack

- Backend: FastAPI, Pydantic, SQLAlchemy async + asyncpg, Alembic
- Frontend: React + TypeScript + Vite, Tailwind CSS, Zustand
- Mapping: MapLibre GL, react-map-gl, DeckGL
- AI integration: Backboard API (multi-agent simulation and narration)
- Database: PostgreSQL

## Project Structure

```
app/
  main.py                # FastAPI app and router wiring
  config.py              # Environment settings
  database.py            # Async SQLAlchemy engine + sessions
  models/                # SQLAlchemy models
  schemas/               # Pydantic request/response schemas
  engine/                # Core simulation logic
  agents/                # Multi-agent orchestration + definitions
  routers/               # API endpoints
  services/              # Backboard, narrators, generators
  seed_data.py           # Kingston seed data
alembic/                 # Migrations
scripts/
  seed_kingston.py       # Seed script
frontend/
  src/                   # React UI
  package.json           # Vite scripts
tests/
```

## Quick Start

### Backend (PowerShell)

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start API server
python -m uvicorn app.main:app --reload
```

### Backend (macOS/Linux)

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start API server
python -m uvicorn app.main:app --reload
```

### Frontend (Vite)

```powershell
cd frontend
npm install
npm run dev
```

The frontend uses a Vite dev proxy to route `/v1/*` to `http://localhost:8000` (see `frontend/vite.config.ts`), so no extra frontend env is required for local dev.

### API Endpoints (mounted today)

- Observability: `GET /v1/health`, `GET /v1/metrics`, `GET /v1/archetypes`
- Scenarios: `POST /v1/scenario/create`, `GET /v1/scenario/{id}`, `GET /v1/scenarios`, `DELETE /v1/scenario/{id}`, `POST /v1/scenario/seed-kingston`
- Proposals: `GET /v1/proposals/templates`, `GET /v1/proposals/templates/{key}`, `GET /v1/proposals/spatial-types`, `GET /v1/proposals/citywide-types`
- Simulation: `POST /v1/simulate`, `POST /v1/simulate/enhanced`, `POST /v1/roleplay`, `POST /v1/compare`, `POST /v1/compare/with-compromises`, `GET /v1/simulations/{scenario_id}`
- AI (multi-agent): `POST /v1/ai/chat`, `GET /v1/ai/debug/session/{session_id}`, `GET /v1/ai/debug/sessions`, `POST /v1/ai/adopt`, `POST /v1/ai/dm`, `GET /v1/ai/relationships/{session_id}`

## Environment Variables

Required:

- `DATABASE_URL`: PostgreSQL URL with asyncpg driver (for example, `postgresql+asyncpg://user:password@localhost:5432/civicsim`)

Optional:

- `BACKBOARD_API_KEY`: Required only for `/v1/ai/*` features (multi-agent simulation and narration)
- `BACKBOARD_BASE_URL`: Backboard API base URL (default: `https://app.backboard.io/api`)
- `APP_ENV`: Environment name (default: `development`)
- `DEBUG`: Enable SQLAlchemy echo (default: `True`)
- `DEFAULT_LAMBDA_DECAY`: Default lambda decay (default: `1.0`)
- `DEFAULT_SEED`: Default random seed (default: `42`)

Example `.env` (create at repo root):

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/civicsim
BACKBOARD_API_KEY=your_backboard_key_here
BACKBOARD_BASE_URL=https://app.backboard.io/api
APP_ENV=development
DEBUG=true
DEFAULT_LAMBDA_DECAY=1.0
DEFAULT_SEED=42
```

## Database & Migrations

1. Create a Postgres database (match your `DATABASE_URL`):

```powershell
psql -U postgres -c "CREATE DATABASE civicsim"
```

2. Apply migrations:

```powershell
alembic upgrade head
```

3. Seed the Kingston scenario (optional):

```powershell
python .\scripts\seed_kingston.py
```

You can also seed via API with `POST /v1/scenario/seed-kingston` once the backend is running. The backend also runs `init_db()` on startup to create tables if they do not exist.

## Useful URLs

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

## Troubleshooting

- `DATABASE_URL` passwords with special characters must be URL-encoded (for example, `p@ss` -> `p%40ss`).
- Database connection errors usually mean Postgres is not running or the database/user in `DATABASE_URL` does not exist.
- Migrations out of sync: run `alembic upgrade head` and verify your `DATABASE_URL` points to the correct database.
- Port conflicts: start the backend on another port with `--port 8001` or change the Vite dev server port.
- Backboard errors (502) mean `BACKBOARD_API_KEY` is missing or invalid for `/v1/ai/*` requests.

## License

MIT
