```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    users     │       │     recipes      │       │ recipe_      │
│──────────────│       │──────────────────│       │ components   │
│ id (PK)      │──┐    │ id (PK)          │──┐    │──────────────│
│ email        │  │    │ recipe_code      │  │    │ id (PK)      │
│ password_hash│  │    │ name             │  └───▶│ recipe_id(FK)│◄──┐
│ role (ENUM)  │  │    │ category         │       │ component_nm │   │
│ full_name    │  │    │ std_fabric_yards │       │ pieces_per   │   │
│ created_at   │  │    │ wastage_cap      │       │ _garment     │   │
└──────────────┘  │    └──────────────────┘       │ image_url    │   │
                  │                               └──────────────┘   │
                  │                                                  │
     ┌────────────┼──────────────────────────────────────────────────┘
     │            │                    │
     │            ▼                    ▼
     │  ┌──────────────────┐  ┌──────────────────────────────┐
     │  │  cutting_orders  │  │    verification_items        │
     │  │──────────────────│  │──────────────────────────────│
     │  │ id (PK)          │◄─│ order_id (FK + COMPOSITE KEY)│
     │  │ order_no (UNIQUE)│  │ component_id (FK)            │
     │  │ recipe_id (FK)   │  │ expected_qty (CALCULATED)    │
     └─▶│ created_by (FK)  │  │ actual_qty (VERIFIER INPUT)  │
        │ target_qty       │  │ status (GREEN/YELLOW/RED)    │
        │ fabric_roll_id   │  └──────────────────────────────┘
        │ actual_fabric_yds│
        │ status (ENUM)    │  ┌──────────────────────────────┐
        │ created_at       │  │     verification_logs        │
        │ updated_at       │  │──────────────────────────────│
        └──────────────────┘  │ id (PK)                      │
                  │           │ order_id (FK)                │
                  └──────────▶│ verifier_id (FK)             │
                              │ decision (APPROVED/REJECTED) │
                              │ rejection_note (nullable)    │
                              │ wastage_pct (COMPUTED)       │
                              │ timestamp                    │
                              └──────────────────────────────┘
```
