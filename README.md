# IGA Beverly Hills Online Store

A full-stack ordering system built for a local grocery store. Customers can browse the catalogue, choose pickup or delivery, pay through Stripe, and track an order. Staff use a separate workflow to accept orders, prepare items, record actual weights, and complete handover.

## Stack

- React, TypeScript, Vite, React Router, and Ant Design
- ASP.NET Core, Entity Framework Core, and PostgreSQL
- Stripe Checkout and partial refunds
- Resend email and Telegram notifications
- Railway and Cloudflare Pages

## Repository layout

| Path | Purpose |
| --- | --- |
| [`backend/`](backend/) | ASP.NET Core API, domain models, services, and EF migrations |
| [`frontEnd/`](frontEnd/) | Customer, staff, and admin web interfaces |
| [`docs/`](docs/) | Local setup and deployment notes |

## Main workflows

- Customer registration and email verification
- Catalogue search and category filters
- Pickup and delivery pricing by suburb
- Stripe payment confirmation through signed webhooks
- Staff order acceptance, preparation, pickup, and delivery handover
- Partial refunds when the recorded actual weight costs less than the estimate; each line can be weighed once while the order is being prepared
- Product, store, carousel, user, and order administration

## Implementation references

The [checkout page](frontEnd/src/pages/Checkout.tsx) connects customer orders
to Stripe Checkout. The [API client](frontEnd/src/api/client.ts) attaches the
bearer token, and [route guards](frontEnd/src/components/BackofficeRouteGuards.tsx)
separate staff and administrator screens. Server-side permissions and order
transitions are enforced in the [order controller](backend/Controllers/OrderController.cs).

The [webhook processor](backend/Services/StripeWebhookProcessor.cs) verifies
Stripe signatures and checks the session, order, currency, and amount before
updating payment state. It records the state transition and event ID in a
database transaction, then attempts notifications separately. Weight refunds
use a Stripe idempotency key and database transaction; the Stripe call and
database commit are not a single atomic operation.

## Local development

Start PostgreSQL, configure the backend environment, and run both applications:

```bash
cd backend
dotnet run --launch-profile http
```

```bash
cd frontEnd
npm install
npm run dev
```

The frontend defaults to `http://localhost:5173`; the development API and Swagger UI run on `http://localhost:5212`.

See [`docs/README.md`](docs/README.md) for configuration and deployment details.
