# GeoCiv 🏛️

**GeoCiv** is an interactive simulation and decision-support platform for exploring how different Kingston community archetypes respond to **spatial developments** and **citywide policy proposals**.

It combines a **deterministic impact engine** with a **multi-agent “town hall” layer** to produce explainable metrics, narratives, and role-play style feedback. The goal is to help policymakers, planners, and students reason about tradeoffs before decisions are made.

## Core Features

* **Spatial + Citywide Proposals:** Support for both map-placed builds (housing, parks) and global policy changes (taxes, subsidies) using shared metric logic.
* **Diverse Community Archetypes:** Models reactions from specific Kingston resident profiles distributed across geographic clusters.
* **Explainable Metric Deltas:** Every approval or opposition outcome is traceable to concrete data across housing, environment, and equity.
* **Multi-Agent Town Hall:** Role-based agents react, debate, and generate narratives, quotes, and compromises in real-time.
* **Map-First Build Workflow:** Drag proposals onto a real Kingston map and immediately visualize simulated responses.
* **Ready-to-Run Demo:** Includes comprehensive seeded data for Kingston so the application works out of the box.

## Tech Stack

* **Frontend:** React, TypeScript, Vite, Tailwind CSS, Zustand
* **Backend:** Python, FastAPI, Pydantic, SQLAlchemy (async), Alembic
* **Database:** PostgreSQL (asyncpg)
* **Mapping:** MapLibre GL, DeckGL, react-map-gl
* **AI/LLM:** Backboard API (Multi-agent simulation and narration)

## Getting Started

To get a local copy of CivicSim up and running, follow these steps.

### Prerequisites

* Python 3.10+
* Node.js and npm
* PostgreSQL 14+
* Backboard API Key (for AI features)

### Installation

1.  **Clone the repo:**
    ```sh
    git clone [https://github.com/lsnchow/kinghacks2026.git](https://github.com/lsnchow/kinghacks2026.git)
    ```
2.  **Setup Backend:**
    ```powershell
    python -m venv venv
    # Windows
    .\venv\Scripts\Activate.ps1 
    # macOS/Linux: source venv/bin/activate
    pip install -r requirements.txt
    ```
3.  **Setup Frontend:**
    ```sh
    cd frontend
    npm install
    ```

## Usage

1.  **Prepare the Database:**
    ```powershell
    psql -U postgres -c "CREATE DATABASE civicsim"
    alembic upgrade head
    # Optional: Seed Kingston data
    python .\scripts\seed_kingston.py
    ```
2.  **Start the Backend:**
    ```sh
    python -m uvicorn app.main:app --reload
    ```
3.  **Start the Frontend:**
    ```sh
    cd frontend
    npm run dev
    ```

Once both servers are running:
1. Open the UI at `http://localhost:5173`
2. Select or create a Kingston **Scenario**
3. Drag **Proposals** onto the interactive map
4. Run the **Simulation** to view metric changes
5. Launch the **Town Hall** to see agent-based debate and transcripts

## Future Development

* **Natural-Language Policy Querying:** Allow users to ask "How would a 2% tax hike affect low-income students?" and receive an AI-generated impact report.
* **Historical Comparison Mode:** Visualize how Kingston's metrics have shifted over time compared to simulated future trajectories.
* **Advanced Conflict Resolution:** Enable agents to propose specific amendments to spatial projects to reach higher community consensus.

## Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/YourFeature`)
3.  Commit your Changes (`git commit -m 'Add YourFeature'`)
4.  Push to the Branch (`git push origin feature/YourFeature`)
