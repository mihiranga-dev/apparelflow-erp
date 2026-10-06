# ApparelFlow ERP - Cutting Verification Gate

Production Batch Verification & Sewing Queue Gate for ApparelFlow ERP. A manufacturing
resource planning module that enforces a server side hard stop preventing incomplete
cutting batches from reaching the sewing floor.

## Core Business Problem

```
┌─────────────────────────────────────────────────────────────────┐
│                    GARMENT FACTORY FLOOR                        │
│                                                                 │
│   FABRIC ROLLS                                                  │
│   (Raw Material)                                                │
│        │                                                        │
│        ▼                                                        │
│   ┌──────────────┐     ┌──────────────────┐     ┌────────────┐  │
│   │   CUTTING    │────▶│   VERIFICATION   │────▶│   SEWING  │  │
│   │  DEPARTMENT  │     │       GATE       │     │   FLOOR    │  │
│   │              │     │                  │     │            │  │
│   │ Supervisor   │     │ Verifier counts  │     │ Supervisor │  │
│   │ creates      │     │ each component   │     │ receives   │  │
│   │ batches      │     │ against recipe   │     │ verified   │  │
│   │              │     │                  │     │ batches    │  │
│   └──────────────┘     └────────┬─────────┘     └────────────┘  │
│                                 │                               │
│                          THE HARD STOP                          │
│                    ┌────────────▼────────────┐                  │
│                    │  ANY RED COMPONENT?     │                  │
│                    │  → BLOCK SEWING QUEUE   │                  │
│                    │  → FORCE REJECTION      │                  │
│                    └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

- **Frontend:** React + TypeScript + Vite (deployed: Netlify)
- **Backend:** Node.js + Express + TypeScript (deployed: Render with Cron-job Trick)
- **Database:** PostgreSQL via Supabase
- **ORM:** Drizzle
- **Auth:** JWT with bcrypt-hashed credentials + role switcher

## Demo Credentials

```
Role	                      Email	                 Password

Cutting Supervisor	supervisor@apparelflow.com	 Password123
Cutting Verifier	  verifier@apparelflow.com	 Password123
Sewing Supervisor	  sewing@apparelflow.com	 Password123
```

## Documentation

- [`AI_OPTIMIZATION_REPORT.md`](./AI_OPTIMIZATION_REPORT.md) — AI usage audit
- [`docs/`](./docs) — architecture diagrams and schema documentation
