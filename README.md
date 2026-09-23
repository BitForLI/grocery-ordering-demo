# Grocery Ordering Workflow Demo

This repository exists because I cannot put an employer's source code on GitHub. During my software engineering internship I worked with grocery-ordering workflows, so I rebuilt the part I wanted to understand in a separate project using my own code and sample data.

It follows an order after the customer presses **Pay**. That is where a grocery system becomes more interesting than a normal product catalogue: store staff still need to prepare the order, weighted products may cost less than estimated, part of the payment may need to be refunded, and the customer needs to know what is happening.

This is a portfolio reconstruction, not the store's production repository and not a claim that every feature shown here was deployed by my employer.

## One order, two views

```text
Customer                                Store staff

browse catalogue                        receive paid order
choose pickup or delivery               accept and prepare it
pay with Stripe                 ->       record actual weights
track order                              issue any price difference refund
receive updates                          hand over or dispatch the order
```

Administrators can manage products, stores, delivery areas, carousel content, users, and orders. Route guards separate staff and administrator screens, while the API repeats the permission checks rather than trusting the browser.

## The backend path I spent the most time on

A successful Stripe page is not enough to mark an order as paid. The API waits for a signed webhook and checks the Stripe session, order, currency, and amount. It then stores the paid transition, processed event, and notification records together.

A background worker leases the email and Telegram notifications, retries temporary failures with backoff, and moves repeatedly failing deliveries to a dead-letter state. An administrator can inspect and requeue them. Delivery is still at-least-once: if an external provider accepts a message immediately before the process stops, the customer could receive a duplicate. The README states that boundary because hiding it would make the design look safer than it is.

Variable-weight refunds have a similar boundary. Each order line can be weighed once during preparation, and Stripe receives an idempotency key, but the remote refund and local database commit are not one atomic transaction.

## What is in the repository

- [`frontEnd/`](frontEnd/) — React and TypeScript interfaces for customers, staff, and administrators
- [`backend/`](backend/) — ASP.NET Core API, Entity Framework models, services, and migrations
- [`backend.tests/`](backend.tests/) — notification-queue integration tests using SQLite in memory
- [`docs/`](docs/) — configuration and deployment notes

The main stack is React, TypeScript, ASP.NET Core, PostgreSQL, Entity Framework Core, and Stripe test mode. The hosted demo uses Railway and Cloudflare Pages; Resend and Telegram are optional notification channels.

## Run it locally

Start PostgreSQL and configure the backend environment described in [`docs/README.md`](docs/README.md), then run:

```bash
cd backend
dotnet run --launch-profile http
```

In a second terminal:

```bash
cd frontEnd
npm install
npm run dev
```

The frontend opens at `http://localhost:5173`; the development API and Swagger UI use `http://localhost:5212`.

Run the backend workflow tests with:

```bash
dotnet test backend.tests/igaServer.Tests.csproj
```
