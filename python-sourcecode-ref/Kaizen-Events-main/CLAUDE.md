# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kaizen Events is a full-stack event registration and management platform. It functions as a self-hosted alternative to Zoho Forms with integrated payment processing (Razorpay, Instamojo), a drag-and-drop form builder with formula-based dynamic pricing, landing page builder (8 templates), and team/campaign management.

## Development Commands

### Frontend (React 19 + Craco)
```bash
cd frontend
yarn install          # Install dependencies
yarn start            # Dev server (port 3000)
yarn build            # Production build
yarn test             # Run Jest tests
```

### Backend (FastAPI + Python 3.11)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Docker (Development — MongoDB + Mongo Express only)
```bash
docker-compose -f docker-compose.dev.yml up    # MongoDB on :27017, Mongo Express on :8081
```

### Docker (Production — full stack)
```bash
docker-compose up -d    # MongoDB, Backend, Frontend, Nginx, Certbot
```

## Architecture

### Monorepo Layout
- `backend/` — FastAPI Python backend (all route modules, models, services as flat .py files)
- `frontend/` — React app built with Craco (CRA + webpack overrides)
- `nginx/` — Reverse proxy config for production
- `docs/` — Architecture, API reference, technical docs, deployment guides

### Backend Structure
All backend code lives as flat Python files in `backend/`. There are no nested packages.

- **`server.py`** — Main FastAPI app, middleware setup, campaign CRUD routes, global exception handlers. Creates the `APIRouter` with `/api` prefix.
- **`models.py`** — All Pydantic models (User, Campaign, Registration, Payment, etc.)
- **`auth.py`** — JWT authentication, password hashing (bcrypt), token creation/validation
- **`security.py`** — Security middleware (rate limiting, request signing, data encryption, XSS sanitization, audit logging)

**Route modules** follow the pattern `*_routes.py` with corresponding `*_models.py`:
- `registration_routes.py` / `registration_models.py` — User registrations
- `form_routes.py` / `form_models.py` / `form_models_advanced.py` — Form builder CRUD
- `payment_routes.py` / `payment_accounts_routes.py` / `offline_payment_routes.py` — Payment processing
- `fund_transfer_routes.py` / `fund_transfer_models.py` — Fund transfers and approvals
- `landing_page_routes.py` / `landing_page_models.py` — Landing page builder
- `campaign_member_routes.py` / `campaign_member_models.py` — Team/access management
- `kiosk_routes.py` / `kiosk_volunteer_routes.py` — On-site registration mode
- `analytics_routes.py` / `analytics_models.py` — Dashboard analytics
- `integration_routes.py` / `integration_service.py` — Google Sheets sync
- `activity_log_routes.py`, `audit_log.py` — Activity/audit logging

**Key services:**
- `formula_engine.py` — Parses dynamic pricing formulas (`sum()`, `if()`, field references like `${field_id}`)
- `payment_service.py` — Shared payment utilities
- `settlement_service.py` — Payment settlement/reconciliation
- `invoice_service.py` — PDF invoice generation (ReportLab)
- `instamojo_oauth_service.py` — Instamojo OAuth flow

### Frontend Structure
- **`src/services/api.js`** — Axios instance with JWT interceptor. Base URL from `REACT_APP_BACKEND_URL`. Auto-redirects to `/login` on 401.
- **`src/context/AuthContext.js`** — React context for auth state. Stores token/user in localStorage. Provides `login`, `logout`, `register` functions.
- **`src/components/ProtectedRoute.js`** — Route guard wrapper for authenticated pages
- **`src/components/AppLayout.js`** — Main admin layout shell
- **`src/hooks/usePublicForm.js`** — Large shared hook (~400 lines) for public registration form logic: formula-based price calculation (`calculateTotal`), conditional field visibility (`getFieldState`), coupon validation
- **`src/components/ui/`** — Shadcn UI components (Radix UI primitives)
- **`src/components/FormBuilder/`** — Form builder components: `FieldEditor`, `FieldRules` (conditional logic), `FormulaBuilder` (pricing), `FormPreview`

**Path alias:** `@` maps to `src/` (configured in `craco.config.js`)

### Database
MongoDB (async via Motor driver). No ORM — direct collection access via `db["collection_name"]`. Key collections: `users`, `campaigns`, `registrations`, `payments`, `payment_accounts`, `form_definitions`, `landing_pages`, `audit_logs`, `activity_logs`, `fund_transfers`, `campaign_members`.

### Authentication & Roles
- JWT (HS256) with access tokens (30 min) and refresh tokens (7 days)
- Token blacklist for logout
- Three roles: `SUPER_ADMIN` (full access), `ORG_ADMIN` (campaign-scoped), `KIOSK_VOLUNTEER` (on-site only)
- Campaign-level access control for org admins

### Key Environment Variables
- **Frontend:** `REACT_APP_BACKEND_URL` (in `frontend/.env`)
- **Backend:** `MONGO_URL`, `DB_NAME`, `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `REQUEST_SIGNING_KEY`, `CORS_ORIGINS`, `FRONTEND_URL`, plus payment gateway keys (Razorpay, Instamojo), email keys (Resend, Brevo), WhatsApp (Interakt)

## Code Patterns

- Backend routes are registered in `server.py` via `app.include_router()`. New route modules should follow the `*_routes.py` naming convention and use the shared `db` instance from `server.py`.
- All API endpoints are prefixed with `/api`. Protected endpoints use `Depends(get_current_user_with_db)` or `Depends(require_super_admin)`.
- Frontend pages live in `src/pages/`. Routing is defined with React Router v7. API calls use the shared `api` axios instance from `src/services/api.js`.
- UI components use Shadcn/Radix patterns with Tailwind CSS. Primary color: `#7c3aed` (purple).
- Form builder uses `@dnd-kit` for drag-and-drop. The formula engine supports `sum()`, `avg()`, `min()`, `max()`, `round()`, `if()` and field references.
