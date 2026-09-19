# IGA Beverly Hills Online Store

A live grocery-ordering system that takes an order from the customer catalogue through payment, preparation, weight adjustment, refund, and final handover.

## Product at a glance

| | |
| --- | --- |
| **Users** | Grocery customers, store staff, and administrators |
| **Problem** | Online ordering must stay consistent while customers pay online and staff fulfil variable-weight items in store |
| **Customer journey** | Browse -> choose pickup or delivery -> pay -> track the order |
| **Staff journey** | Accept -> prepare -> record actual weights -> refund the difference -> hand over |
| **Stack** | React, TypeScript, ASP.NET Core, PostgreSQL, Stripe, Railway, Cloudflare Pages |

The product is more than a storefront. It connects customer actions with the operational work inside the store, including delivery zones, payment confirmation, staff permissions, actual-weight pricing, partial refunds, and notifications.

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
