# AnyShare

Browser-based nearby sharing. Open the page on two devices, see peers on the same network, and send text or files.

- Frontend: Vite + React + TanStack Router + shadcn (`apps/web`)
- Backend: Phoenix/Elixir, release built from `apps/backend/Dockerfile`
- Database: PlanetScale Postgres
- Infra: Alchemy (`alchemy.run.ts`)

PlanetScale Postgres is provisioned by Alchemy (`Planetscale.PostgresDatabase`, `Planetscale.PostgresRole`) and the Phoenix container receives `DATABASE_URL` from the role. The container is a Dockerfile class:

```ts
export class ElixirBackend extends Cloudflare.Container<ElixirBackend>()("ElixirBackend", {
  context: "../apps/backend",
});
```

A Durable Object starts that container and talks to Phoenix on port 8080. The API Worker is the public URL in front of that Durable Object. The Vite site receives that URL as `VITE_API_URL`. The backend CORS policy allows the local Vite origin and `https://anyshare-website-*.workers.dev`.

## Prerequisites

- nub
- Docker (Alchemy builds the Elixir release image)
- `alchemy login` (Cloudflare + PlanetScale)

## Local development

```sh
alchemy login
alchemy dev
```

- Frontend: http://localhost:3000
- Backend: printed `apiUrl` (also `VITE_API_URL`)

## Deploy

```sh
alchemy deploy
```

Open `websiteUrl`. The browser calls `apiUrl`.
