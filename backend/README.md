# Backend

The backend is an ASP.NET Core API backed by PostgreSQL and Entity Framework Core. It owns authentication, catalogue data, orders, payments, refunds, store settings, and staff workflows.

## Run locally

```bash
dotnet run --launch-profile http
```

Swagger is available at `http://localhost:5212/swagger` in Development.

## Configuration

Keep secrets outside the repository. The main production settings are:

```text
ASPNETCORE_ENVIRONMENT=Production
Jwt__SigningKey=<random value of at least 32 bytes>
ConnectionStrings__DefaultConnection=<PostgreSQL connection string>
Cors__AllowedOrigins__0=https://igabeverlyhills.com
Stripe__SecretKey=...
Stripe__WebhookSecret=...
Stripe__SuccessUrl=https://igabeverlyhills.com/?payment=success&orderId={orderId}
Stripe__CancelUrl=https://igabeverlyhills.com/?payment=cancelled&orderId={orderId}
```

`DATABASE_URL` is accepted when `ConnectionStrings__DefaultConnection` is not set. Stripe's flat environment-variable names are also mapped by `Program.cs`.

Bootstrap admin and staff credentials can be supplied temporarily through `BootstrapAdmin__*` and `BootstrapStaff__*`. Remove the password variables after the accounts have been created.

## Railway

Set the service root directory to `backend`. The project file is `backend/igaServer.csproj`, so a deployment started from the repository root will not be detected correctly by Railpack.

An optional `backend/**` watch path prevents frontend-only changes from rebuilding the API.

## Development maintenance commands

The following commands refuse to run in Production:

```bash
dotnet run -- --clear-users
dotnet run -- --clear-products
dotnet run -- --resync-all-catalogs
```

Database migrations can be applied with:

```bash
dotnet ef database update --project igaServer.csproj
```
