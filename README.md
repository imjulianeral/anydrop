# AnyDrop

Browser-based nearby sharing. Open the page on two devices, see peers on the same network, and send text or files.

- Frontend: Vite + React + TanStack Router + shadcn (`apps/web`)
- Backend: Rails 8, image built from `apps/backend/Dockerfile`
- Database: Prisma Postgres
- Infra: Alchemy (`alchemy.run.ts`)

Rails is an Alchemy Container **class** with a Dockerfile `context`:

```ts
export class Rails extends Cloudflare.Container<Rails>()("Rails", {
  context: "../apps/backend",
});
```

A Durable Object starts that container and talks to Puma on port 3000. The API Worker is only the public URL in front of that Durable Object. The Vite site receives that URL as `VITE_API_URL`. Rails CORS allows the local Vite origin and `https://anydrop-website-*.workers.dev`.

## Prerequisites

- nub
- Ruby 3.3+ / 4.x (local Prisma `db:prepare`)
- Docker (Alchemy builds the Rails image)
- `alchemy login`

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
