# Diabetes Expert System 🩺

A professional, full-stack web application designed to leverage an expert system for diabetes diagnosis, management recommendations, and clinical workflow tracking. Built with a modern **React (Vite+Tailwind)** frontend and a robust **Flask** backend, fortified by secure role-based access control (RBAC), and backed by a **Supabase PostgreSQL** database.

![Doctor dashboard](docs/screenshots/doctor-dashboard.png)

---

## 📸 Screenshots

### Sign in
![Login page](docs/screenshots/login.png)

### Doctor workspace
| Assessment workspace | Diagnosis result |
|---|---|
| ![Assessment workspace](docs/screenshots/diagnosis-assessment.png) | ![Diagnosis result](docs/screenshots/diagnosis-result.png) |

| Patient management | Patient detail |
|---|---|
| ![Patient list](docs/screenshots/patients.png) | ![Patient detail](docs/screenshots/patient-detail.png) |

| Clinical review | Knowledge base |
|---|---|
| ![Clinical review](docs/screenshots/medical-review.png) | ![Knowledge base rules](docs/screenshots/rules-knowledge-base.png) |

### Patient portal
| Patient dashboard | Care plan |
|---|---|
| ![Patient dashboard](docs/screenshots/patient-dashboard.png) | ![Care plan](docs/screenshots/care-plan.png) |

### Administration
| User directory | Audit logs |
|---|---|
| ![User directory](docs/screenshots/admin-users.png) | ![Audit logs](docs/screenshots/audit-logs.png) |

### Dark mode & mobile
| Dark mode | Mobile |
|---|---|
| ![Dark mode dashboard](docs/screenshots/dark-mode-dashboard.png) | <img src="docs/screenshots/mobile-patient-dashboard.png" alt="Mobile patient dashboard" width="300"> |

---

## 🎯 Key Features

### 🧠 Expert System Core
- **Forward Chaining Inference Engine**: Processes patient symptoms, lab results, and risk factors through a deterministic rule-engine.
- **Explainable AI (XAI) Output**: Every diagnosis includes a detailed, transparent explanation trace—from fact preparation to rule triggers, confidence calculation, and final recommendations.
- **Certainty Factor Integration**: Weighs clinical inputs dynamically to provide a confidence score for each diagnosis.

### 🛡 Security & Access Control (RBAC)
- **Role-Based Roles**: Customized access for `admin`, `doctor`, and `patient`.
- **JWT Authentication**: Secured session management with short-lived access tokens, refresh tokens, and active revocation tracking.
- **Admin Control Panel**: Comprehensive dashboard to manage users, configure roles, inspect permissions, and monitor system activity and audit logs.

### 🏥 Clinical Workflow
- **Patient Management**: Doctors can track patient histories, manage profiles, and review sequential lab results and symptoms.
- **Diagnosis Assessment**: Interactive, multi-step assessment forms enforcing stringent medical input validation.
- **Medical Review System**: Capabilities for clinical staff to flag urgent cases, add qualitative review notes, and annotate auto-generated diagnoses.

### 📚 Knowledge Base Management
- **Rule Editor**: A dedicated UI for medical professionals (or admins) to create, modify, and archive diagnostic rules without touching code.
- **Versioning & Auditing**: Every change to the rule set is snapshotted (`rule_versions`) and logged (`audit_logs`) to ensure compliance and traceability.

---

## 🛠 Tech Stack

**Frontend:**
- React 18 / Vite
- Tailwind CSS / shadcn/ui (Accessible, modern UI components)
- React Router (Guarded routing based on user claims)

**Backend:**
- Python 3 / Flask
- SQLAlchemy ORM / Alembic (Database Migrations)
- psycopg / PostgreSQL (Hosted via Supabase)
- Flask-JWT-Extended / Werkzeug (Auth & Security)

---

## 🧭 Two Ways to Try It

**1. Live demo — the patient experience.** Sign up on the hosted site
(_link coming soon_) with any email. Every new account is a **patient**: you can
take a diabetes risk assessment, read your result, and follow your care plan.
Administrator and doctor accounts on the live site are private, so the
knowledge base and access settings stay accurate for everyone.

**2. Full system — run your own copy.** To explore the doctor workspace, the
rule editor, and the admin panel, clone the project and run it on your computer.
Your copy uses its own local database and creates the demo admin, doctor, and
patient accounts listed [below](#-demo-accounts-local-copies). Anything you
change only affects your copy.

macOS / Linux (needs Python 3.11+ and Node.js 20+):

```bash
git clone https://github.com/Tisaa-no-smoke/Diabetes_Expert_system.git
cd Diabetes_Expert_system
./run.sh
```

The first start installs dependencies, then open <http://localhost:5173>.
On Windows, follow the [Windows quick start](#windows-local-quick-start-sqlite).
PDF report export also needs WeasyPrint's system libraries
([install guide](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#installation));
everything else works without them.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v20+)
- Python (3.11+)
- A [Supabase](https://supabase.com) account & PostgreSQL instance (or local PostgreSQL)

### Windows local quick start (SQLite)

Run these commands from the project directory in PowerShell. Python 3.11 or
newer is required (`datetime.UTC` is used by the backend).

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

In `backend/.env`, set `DATABASE_URL=sqlite:///dev_local.db`,
`DB_AUTO_CREATE=true`, and `DB_FALLBACK_ENABLED=false`. Keep
`FLASK_DEBUG=1` and `SEED_DEMO_DATA=1` for the local demo, and replace
`SECRET_KEY` with a randomly generated value. Then start the API:

```powershell
.\.venv\Scripts\python.exe run.py
```

In a second PowerShell terminal, from the project directory:

```powershell
cd frontend
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Open http://localhost:5173. The API health endpoint is
http://127.0.0.1:5001/api/health. The local database is stored in
`backend/instance/dev_local.db`. Do not overwrite an existing `.env` when
restarting; environment setup and installation are only needed initially.
`backend/run.py` reads `backend/.env`; the root `.env` is used by `main.py`
and Docker Compose.

### 1. Backend Setup (PostgreSQL)

1. **Navigate to the backend directory and install dependencies:**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set your `DATABASE_URL` to your full **Supabase Session Pooler URL** (ensure you use `postgresql+psycopg://...`). Example:
   ```env
   DATABASE_URL=postgresql+psycopg://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
   FLASK_RUN_PORT=5001
   ```

3. **Initialize the Database:**
   Apply migrations to build the schema in your Supabase database.
   ```bash
   export FLASK_APP=run.py
   flask db upgrade
   ```

4. **Run the API Server:**
   ```bash
   python run.py
   ```
   *The backend will typically start on `http://127.0.0.1:5001`.*

### 2. Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   Ensure `VITE_API_BASE_URL` points to your running backend (e.g., `http://127.0.0.1:5001/api`).

3. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   *The frontend will typically start on `http://localhost:5173`.*

---

## 🔑 Demo Accounts (Local Copies)

The default knowledge base is the expanded **v3** set (59 rules and 99 catalog
facts). It includes two-test confirmation, random glucose with classic
symptoms, pregnancy-specific fasting/1-hour/2-hour 75-g OGTT criteria,
discordant-result review, and near-threshold repeat-testing guidance. Set
`RULES_SEED_VERSION=v3` in `backend/.env`. For an already initialized database,
synchronize the rule set and fact catalog from the backend directory:

```bash
source .venv/bin/activate
flask --app run.py sync-knowledge-base --version v3
```

This archives rules from other bundled versions, inserts missing v3 rules and
fact definitions, and preserves custom rules, existing fact edits, users and
patient records. Existing inactive v3 rules stay inactive; archived v3 rules
are reactivated when switching back to v3. Derived facts appear in the catalog
but do not contribute independent symptom weights. The command is safe to
repeat. The `--version` option applies to that invocation; the environment
setting selects the version for future seeding. Restart the backend after
changing the environment setting.

If you enabled `SEED_DEMO_DATA=true` in your backend environment, the following accounts will be pre-provisioned:

| Role        | Email                  | Password     |
|-------------|------------------------|--------------|
| Admin       | admin@example.com      | `admin123`   |
| Doctor      | doctor@example.com     | `doctor123`  |
| Patient     | patient@example.com    | `patient123` |

These passwords are public, so never enable demo seeding on a public
deployment. On a server, set `SEED_DEMO_DATA=false` and `DB_AUTO_CREATE=false`,
and replace the password of any account that already exists:

```bash
cd backend
flask --app run.py set-password admin@example.com   # prompts, input hidden
```

---

## 🌐 Deploying (Vercel)

`vercel.json` deploys two Vercel services on one domain: `frontend` (the
React site, with page links falling back to `index.html`) and `backend` (the
Flask API from `backend/index.py`, receiving `/api/*` and `/health` with the
original path), in the Mumbai region (`bom1`) next to a Supabase database
there. Profile photos are stored in the database, so
nothing depends on the server's disk.

1. In Vercel choose **Add New → Project**, import this repository (branch
   `tisa`), and accept the multi-service project it detects.
2. Add these **Environment Variables** before the first deploy:
   - `DATABASE_URL`: your Supabase **Session pooler** URL
     (`postgresql+psycopg://...:5432/postgres`)
   - `SECRET_KEY`: a long random value (`python generate_secret_key.py`)
   - `TRUSTED_PROXY_COUNT=1`, `FLASK_DEBUG=0`, `SEED_DEMO_DATA=false`,
     `DB_AUTO_CREATE=false`, `DB_FALLBACK_ENABLED=false`
   - optional: `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` (same value)
3. Deploy. The API refuses to start without `SECRET_KEY` and `DATABASE_URL`,
   so a missing value shows up as an error instead of lost data.

Vercel does not run database migrations. After pulling changes that add a
migration, apply it once from your computer with `backend/.env` pointing at
the production database: `flask --app run.py db upgrade`. A brand-new
database also needs the rule set once: `flask --app run.py sync-knowledge-base --version v3`.
Photos uploaded before database storage can be copied in with
`flask --app run.py import-avatars`.

The root `Dockerfile` and `render.yaml` remain as an alternative single-service
deployment (e.g. Render).

---

## 🧪 Testing and Verification

**Backend tests:**
```bash
cd backend
source .venv/bin/activate
pytest
```

On macOS with Homebrew's native Pango/Cairo libraries, prefix backend test or
server commands with `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` if
WeasyPrint reports that it cannot load `libgobject`.

**Frontend checks:**
```bash
cd frontend
npm test
npm run lint
npm run check:locales
npm run build
```

**Isolated browser workflows:**
```bash
cd frontend
npm run test:e2e
```

The browser suite starts disposable services on ports 5002 and 5174 and uses a
temporary SQLite database. It never opens or modifies the local development
database. On Windows, set `E2E_PYTHON` to the backend virtual-environment
Python executable before running the suite.

---

*This system is intended for research, demonstration, and clinical assistance prototyping. Always consult a certified healthcare professional for actual medical diagnosis and treatment.*
