# Meridian — Architecture & Implementation Plan

## 1) High-level architecture

```mermaid
flowchart TB
  subgraph Client[Browser / Next.js App Router]
    UI[UI: Listings, Seat Map, Booking Flow]
    View[Three.js hall view\nSeat camera, stereo pair, metrics]
    RT[Realtime subscription\nseat status updates]
  end

  subgraph Next[Next.js 15 + TypeScript]
    SA[Server Actions / Route Handlers]
    Auth[Auth.js (NextAuth v5)\nCredentials/Email + RBAC]
    Hold[Seat Hold Service\ntransaction + row locks / optimistic checks]
    Book[Booking Service\nconfirm + ticket issuance]
    Admin[Admin routes + guards]
    WH[Stripe Webhook Handler]
  end

  subgraph Data[Data & Infra]
    PG[(PostgreSQL\nPrisma ORM)]
    Stripe[Stripe Checkout]
    Redis[(Optional Redis)\nfast locks / pubsub]
  end

  UI --> SA
  View --> UI
  RT <-->|Supabase Realtime or polling fallback| PG
  SA --> Auth
  SA --> Hold
  SA --> Book
  SA --> Admin
  Hold --> PG
  Book --> PG
  Book --> Stripe
  WH --> Stripe
  WH --> PG
  Hold -. optional .-> Redis
```

## 2) Key design decisions

- **Seat truth per show**: `ShowSeat` is the inventory row for `(showId, seatId)` with `status = AVAILABLE|HELD|BOOKED`, `holdExpiresAt`, `heldByUserId`, `version` (optimistic concurrency). This avoids double booking.
- **Hold flow (critical)**: `POST /api/shows/:showId/holds` runs in a DB transaction: `SELECT ... FOR UPDATE` (or `UPDATE ... WHERE status='AVAILABLE' OR (status='HELD' AND holdExpiresAt < now()) OR (status='HELD' AND heldByUserId = userId)`), sets `HELD` + 10 min expiry + increments `version`. Returns hold token/expiry.
- **Checkout**: create Stripe Checkout Session referencing `bookingIntent`/held seats; webhook `checkout.session.completed` marks seats `BOOKED`, creates `Booking` + `Ticket` (QR payload). Expired holds are released by lazy checks + optional cron cleanup.
- **3D view**: parametric hall in plain Three.js (`src/components/seat-view/hall-view.ts`). Each `Seat` stores local coordinates (`x,y,z,rowIndex,colIndex`) relative to the hall origin. The camera sits at the seat eye position and looks at the screen center. Seats are instanced meshes, and the camera eases between seats.
- **Realtime**: abstract `SeatUpdatesProvider` — Supabase Realtime subscription on `ShowSeat` when configured, else short polling (2–4s) fallback for local/dev without extra infra.
- **Auth**: Auth.js with credentials (demo) + role (`USER|ADMIN|OPERATOR`). Admin routes protected by middleware + server checks.

## 3) Trade-offs / future enhancements

- **Supabase vs plain Postgres**: schema targets Postgres; Realtime is easiest on Supabase. Local Docker uses polling fallback; production can enable Supabase Realtime.
- **Redis**: optional optimization; DB row locks are sufficient for correctness at moderate scale.
- **3D fidelity**: parametric interior (fast, maintainable) vs imported GLTF hall models (more realistic). Support GLTF per hall as enhancement.
- **Multi-hall geometry**: `Hall` stores dimensions/screen config; seat generator derives coordinates. Admin can override per seat.
- **Payments**: Stripe Checkout chosen for PCI scope reduction; PaymentIntents possible for embedded flow.
- **Enhancements**: AI seat recommendations, spatial audio preview, accessibility audio descriptions, dynamic pricing, group seat suggestions, waitlist.

## 4) Folder structure

```text
decision/
├─ docker-compose.yml
├─ .env.example
├─ README.md
├─ ARCHITECTURE.md
├─ package.json
├─ next.config.ts
├─ tsconfig.json
├─ postcss.config.mjs
├─ tailwind.config.ts
├─ components.json              # shadcn config
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx
│  │  ├─ page.tsx               # home / listings entry
│  │  ├─ globals.css
│  │  ├─ (auth)/signin/page.tsx
│  │  ├─ cinemas/page.tsx
│  │  ├─ cinemas/[cinemaId]/page.tsx
│  │  ├─ shows/[showId]/page.tsx        # seat map + 3D view
│  │  ├─ checkout/success/page.tsx
│  │  ├─ bookings/page.tsx
│  │  ├─ admin/
│  │  │  ├─ layout.tsx
│  │  │  ├─ page.tsx
│  │  │  ├─ halls/page.tsx
│  │  │  └─ shows/page.tsx
│  │  └─ api/
│  │     ├─ auth/[...nextauth]/route.ts
│  │     ├─ shows/[showId]/seats/route.ts
│  │     ├─ shows/[showId]/hold/route.ts
│  │     ├─ shows/[showId]/release/route.ts
│  │     ├─ checkout/route.ts
│  │     └─ webhooks/stripe/route.ts
│  ├─ components/
│  │  ├─ seat-map/
│  │  │  ├─ SeatMap.tsx
│  │  │  ├─ SeatButton.tsx
│  │  │  └─ SeatLegend.tsx
│  │  ├─ seat-view/
│  │  │  ├─ SeatViewCanvas.tsx
│  │  │  ├─ hall-view.ts
│  │  │  ├─ SeatMetricsOverlay.tsx
│  │  │  └─ camera-math.ts
│  │  ├─ booking/
│  │  │  ├─ SelectionPanel.tsx
│  │  │  └─ HoldTimer.tsx
│  │  └─ ui/                    # shadcn primitives (minimal set)
│  ├─ lib/
│  │  ├─ db.ts
│  │  ├─ auth.ts
│  │  ├─ auth-guards.ts
│  │  ├─ stripe.ts
│  │  ├─ seat-lock.ts
│  │  ├─ booking.ts
│  │  ├─ metrics.ts
│  │  ├─ validations.ts
│  │  ├─ rate-limit.ts
│  │  └─ utils.ts
│  ├─ types/
│  │  └─ index.ts
│  └─ middleware.ts
└─ tests/
   └─ seat-lock.test.ts         # example critical-path test
```
