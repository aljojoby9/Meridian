# Meridian

Meridian is a cinema booking app that shows the view from a seat before you buy it. Pick a show, look around the hall in first person, hold a seat, and check out.

The hall, the seat camera, and the side-by-side VR pair are rendered with Three.js. The rest of the interface is a Next.js app: listings, a 2D seat map, holds, Stripe checkout, tickets, and a small admin.

## Features

- Browse cinemas and upcoming shows.
- Open a first-person view from any seat, with distance, offset, and field-of-view readouts.
- Match a seat with Aperture: Closer, Balanced, or Wider, then preview the best open seat.
- Hold seats for 10 minutes with PostgreSQL row locks so two people cannot book the same seat.
- Pay with Stripe Checkout. A verified webhook confirms the booking and issues QR tickets.
- Sign in with demo accounts. Admins can review halls, shows, and bookings.

## Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- **3D:** `three` (`WebGLRenderer`). React Three Fiber and Drei are not used.
- **API:** Next.js route handlers and server actions, with Zod on write endpoints
- **Data:** PostgreSQL and Prisma
- **Auth:** Auth.js / NextAuth v5, credentials, JWT sessions, role checks
- **Payments:** Stripe Checkout and signed webhooks
- **Seat updates:** 4-second polling. The provider can be swapped for Supabase Realtime later.

## Prerequisites

- Node.js 20 or newer
- Docker, for local PostgreSQL
- Stripe test keys, when you want to complete a payment

## Local setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Start PostgreSQL. Compose creates the user, password, and database `meridian` on port 5432.

   ```bash
   docker compose up -d
   ```

   Any PostgreSQL 16 instance with those same credentials works. On Windows, point `DATABASE_URL` at `127.0.0.1`. `localhost` can resolve to IPv6 first, and a server bound to IPv4 will refuse that connection.

3. Create the environment file.

   ```bash
   cp .env.example .env
   ```

   Set `AUTH_SECRET` (`openssl rand -base64 32`). Add Stripe test keys when you want live checkout. The dev server listens on port 3001, and `.env.example` already uses that origin for `AUTH_URL` and `NEXT_PUBLIC_APP_URL`.

4. Create the schema and seed the demo cinema.

   ```bash
   npm run db:push
   npm run db:seed
   ```

5. Start the app.

   ```bash
   npm run dev
   ```

   Open [http://localhost:3001](http://localhost:3001). A seeded show is at `/shows/seed-show-1`.

## Demo accounts

These come from `.env.example`. Change them before any shared deployment.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@meridian.local` | `Admin123!ChangeMe` |
| Guest | `user@meridian.local` | `User123!ChangeMe` |

## Product

### Seat view

`/shows/[showId]` loads the hall and renders the 2D seat map beside the Three.js view (`src/modules/seat-preview/ui/hall-view.ts`). Choosing a seat flies the camera from the overview to that seat’s eye position and looks at the centre of the screen. The flight stays inside the hall and does not roll. Clearing the seat returns to the centreline overview.

Metrics in `src/modules/seat-preview/domain/metrics.ts` report distance to the screen, horizontal field of view, horizontal offset, and a label such as Up Close, Sweet Spot, Full Picture, Rear View, or Side View.

The screen plays the show trailer when `trailerUrl` loads, and otherwise shows a generated title card. Seats are instanced meshes. Spatial preview draws a real side-by-side stereo pair. On a headset, the same control requests a WebXR session.

### Aperture

Aperture ranks open seats from the same geometry as the preview. On a show, choose **Closer**, **Balanced**, or **Wider**. The best matches are marked on the seat map, and **Preview best** flies the camera to the top match. Scoring lives in `src/modules/seat-preview/domain/aperture.ts`.

### Holds

`POST /api/shows/:showId/hold` requires a signed-in user, validates the body, rate-limits the caller, and runs the `HoldSeats` use case (`src/modules/seating/application/use-cases.ts`). The row-locked claim is in `src/modules/seating/infrastructure/prisma-seat-hold.repository.ts`.

Inside one transaction the hold:

1. Locks the requested rows, and this user’s other holds for the show, with `SELECT … FOR UPDATE` in a fixed order.
2. Expires stale holds on those seats.
3. Rejects seats that are not available to this user.
4. Releases this user’s previous hold on the show.
5. Marks the seats `HELD` for `SEAT_HOLD_MINUTES` (default 10), stores a `holdToken`, and increments `version`.

One of two concurrent requests for the same seat succeeds. The other receives `409` and can refresh and retry. Leaving the page does not release the hold. `POST /api/shows/:showId/release` does. Expired holds are cleared the next time a hold or seat read runs.

### Checkout and tickets

`POST /api/checkout` checks the active hold and creates a pending booking. When all three Stripe values are real, it creates a Stripe Checkout Session whose metadata includes `bookingId`, `showId`, `userId`, and `holdToken`. While any value is still a placeholder, it confirms locally in **demo mode** so the whole flow can be exercised without keys. Production fails closed (503) unless `ALLOW_DEMO_CHECKOUT=true` is set explicitly, so placeholder keys can never hand out free tickets.

`GET /api/checkout` reports which mode is active and which variables are still placeholders (never the values themselves).

`POST /api/webhooks/stripe` verifies `STRIPE_WEBHOOK_SECRET`. On `checkout.session.completed` with `payment_status=paid`, confirmation is idempotent: seats become `BOOKED`, tickets are created with QR payloads, and the payment row is stored. As a safety net, `/checkout/success?...&session_id=...` also verifies a paid session directly if the webhook has not arrived (or was not configured), so a paid customer always gets tickets.

### Admin

`/admin` is limited to the admin role. It lists halls, creates shows (which generates `ShowSeat` inventory), and shows bookings and occupancy.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server on port 3001 |
| `npm run build` | Production build |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run stripe:setup` | Interactive Stripe key wizard + live-mode verification |
| `npm run stripe:status` | Print Stripe mode + which values are still placeholders |
| `npm run db:push` | Apply `prisma/schema.prisma` to the database |
| `npm run db:seed` | Seed the demo cinema, shows, and accounts |
| `npm run db:studio` | Open Prisma Studio |

## Adding your Stripe values

The app ships with placeholders (`sk_test_...`, `pk_test_...`, `whsec_...`), which means checkout runs in **demo mode**. Switch to real Stripe Checkout with the wizard:

```bash
npm run stripe:setup    # interactive: paste the 3 values, it writes .env and verifies
npm run stripe:status   # read-only: print current mode and what's still missing
```

`stripe:setup` validates each value locally (real `sk_test_…` / `pk_test_…` / `whsec_…` shapes), rewrites `.env` in place, then polls `GET /api/checkout` until the app reports `"mode":"live"`. It never prints your secrets back. If the dev server isn't running, it tells you to start it and re-check with `npm run stripe:status`.

Step by step (what the wizard does for you):

1. **Keys**: In the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys), switch to **Test mode** and copy the **Publishable key** (`pk_test_...`) and **Secret key** (`sk_test_...`).
2. **Webhook secret**: Install the [Stripe CLI](https://docs.stripe.com/stripe-cli), run `stripe login`, then:
   ```bash
   stripe listen --forward-to localhost:3001/api/webhooks/stripe
   ```
   Copy the **webhook signing secret** (`whsec_...`) from that output.
3. **Verify**: Run `npm run stripe:setup` (or paste all three values into `.env` and run `npm run stripe:status`). Then run `curl http://localhost:3001/api/checkout` — you want `"mode":"live"` and `"missing":[]`.
4. **Restart the dev server** (`npm run dev`) so Next.js reloads `.env`.

Use test card `4242 4242 4242 4242` with any future expiry/CVC when trying a payment. For deployment, point the webhook at `https://<domain>/api/webhooks/stripe` and use live-mode keys only when you are ready to take real payments.

## Tests

```bash
npm test
```

- `tests/seat-pov.test.ts` locks the camera path, glance limits, and VR head pose.
- `tests/show-visuals.test.ts` checks hall and seat-map contrast.
- `tests/metrics.test.ts` checks the seat readout math.
- `tests/aperture.test.ts` checks the matcher.
- `tests/seat-lock.test.ts` records the row-lock contract. It does not connect to a database.
- `tests/application/` tests the use cases (holds, checkout, payment confirmation, sign-in, show scheduling) with in-memory fakes, with no database or Stripe.
- `tests/architecture.test.ts` enforces the hexagonal layering described in `ARCHITECTURE.md`.

## Deployment

- Deploy the Next.js app and set every variable from `.env.example`. Use managed PostgreSQL. Apply the schema with `prisma db push` or `prisma migrate deploy` once migrations exist.
- Point the Stripe webhook at `https://<domain>/api/webhooks/stripe` for `checkout.session.completed`.
- Set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the public origin, and use a long random `AUTH_SECRET`.
- Replace the in-memory rate limiter with Redis or Upstash before running more than one instance. Row locks in PostgreSQL stay the source of truth for seat claims.
- Add a scheduled job to expire stale holds, in addition to the lazy expiry already in the hold path.

## Security

- Write endpoints validate input with Zod.
- Holds, checkout, bookings, and admin routes require auth. Admin routes also check the role.
- Hold and checkout routes are rate-limited in memory for the demo.
- Stripe webhooks are signature-checked, and confirmation is idempotent.
- The client does not decide price, availability, or whether a booking is paid.

The hexagonal module layout, dependency rules, and request flows are in [`ARCHITECTURE.md`](./ARCHITECTURE.md).
