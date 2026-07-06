# Order Platform — Multi-Store Order Management

## What's in this repo right now

- `apps/web` — Next.js 15 (App Router) frontend, fully working with mock data.
  Run it today, no backend needed yet.
- `apps/api/prisma/schema.prisma` — the canonical database schema for the
  backend (NestJS + Postgres), ready to scaffold against.

## Run the frontend

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to /orders.

Everything is wired against `lib/mock-data.ts` (220 realistic fake orders
across 6 stores) so you can develop and demo the UI before the backend exists.

## What's built

- Multi-store sidebar switcher (select one, several, or all stores)
- Full order table: order #, store, date, customer, order/payment/fulfillment
  status badges, item count, totals (with refund amounts shown inline)
- Filter bar: search (order #, customer, email) + multi-select filters for
  order status, payment status, fulfillment status
- Bulk selection + bulk actions bar (mark fulfilled, tag, refund, cancel —
  UI only for now, wire to API next)
- Order detail drawer: customer info, shipment/tracking, line items, totals
  breakdown
- Pagination
- Design system: status-color language (every order state maps to one
  consistent color across the whole app), Inter + JetBrains Mono type system,
  full token system in `app/globals.css`

## Canonical types

`types/order.ts` defines `Order`, `Store`, `OrderStatus`, `FinancialStatus`,
`FulfillmentStatus` etc. These mirror `apps/api/prisma/schema.prisma` field
for field — when the backend is scaffolded, move this file into a shared
`packages/shared-types` package so frontend and backend never drift apart.

## Next steps (backend)

1. `cd apps/api && npx @nestjs/cli new . ` (or similar) and wire up Prisma
   using the schema already in `apps/api/prisma/schema.prisma`
2. Auth + store-scoped access (every query filtered by the logged-in user's
   accessible stores — this should be a guard/interceptor, not per-controller
   logic)
3. Real `GET /orders` endpoint matching the filter shape already used in
   `app/orders/page.tsx`, then swap `mock-data.ts` for real fetch calls
4. Shopify webhook ingestion (orders/create, orders/updated, fulfillments,
   refunds) → BullMQ queue → upsert into canonical Order table
5. Delivery/courier integration behind a `DeliveryProvider` interface
6. Inventory + stock alerts

See full phased plan in conversation history / project docs.
