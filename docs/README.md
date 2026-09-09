# Setup and Deployment

## Backend

The API uses .NET, Entity Framework Core, Npgsql, Stripe, Resend, and Telegram. Configuration is loaded from `appsettings.json`, the environment-specific settings file, and environment variables in that order.

Required production configuration:

- `ConnectionStrings__DefaultConnection` or `DATABASE_URL`
- `Jwt__SigningKey`
- `Cors__AllowedOrigins__0`, with additional origins using the next array index
- `Stripe__SecretKey` and `Stripe__WebhookSecret`
- Resend and Telegram credentials when those notifications are enabled

Run the API and apply migrations from `backend/`:

```bash
dotnet run --launch-profile http
dotnet ef database update --project igaServer.csproj
```

For local Stripe webhooks:

```bash
stripe listen --forward-to localhost:5212/api/payment/webhook
```

## Frontend

The React application lives in `frontEnd/` and uses React Router, Ant Design, Axios, and Vite.

```bash
cd frontEnd
npm install
npm run dev
```

Set `VITE_API_BASE` to the backend URL ending in `/api`. Vite reads this value at build time, so a Cloudflare Pages deployment must be rebuilt after it changes.

Main routes:

- `/` - customer storefront
- `/admin` - administration
- `/staff/orders` - fulfilment workflow

## Deployment

### Railway API

1. Set the service root directory to `backend`.
2. Attach PostgreSQL and provide the required environment variables.
3. Point the Stripe webhook to `https://<api-host>/api/payment/webhook`.
4. Redeploy after changing runtime configuration.

### Cloudflare Pages

| Setting | Value |
| --- | --- |
| Root directory | `frontEnd` |
| Build command | `npm ci && npm run build` |
| Output directory | `dist` |
| API setting | `VITE_API_BASE=https://<api-host>/api` |

The repository includes `public/_redirects` so direct navigation to React routes works after deployment.

## Troubleshooting

- A production frontend that still calls localhost was built without `VITE_API_BASE`.
- Both the storefront and API must use HTTPS in production to avoid mixed-content blocking.
- A new preview or custom domain must be included in the backend CORS origins exactly as it appears in the browser.
- Railway reports `could not determine how to build the app` when its root directory is not set to `backend`.
