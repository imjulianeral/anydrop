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

## File storage

Alchemy creates the private `Files` R2 bucket. Cloudflare OAuth from `alchemy login` cannot create API tokens (Cloudflare error 9109), so Alchemy does not mint R2 keys.

Without `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, `alchemy dev` stores files on the container disk. The browser uploads through the API (`/api/v1/local_blobs`).

To send bytes straight to R2, create an R2 API token in the Cloudflare dashboard (R2 → Manage API Tokens) with Object Read & Write. Then set:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

before `alchemy dev` or `alchemy deploy`. Alchemy still supplies the bucket name and endpoint from the `Files` resource. `alchemy deploy` requires those two variables.

Elixir authorizes transfers and creates signed upload and download URLs that expire after 15 minutes. Browsers send file bytes directly to R2. The bucket permits CORS requests with signed URLs; CORS does not grant public access. The existing lifecycle rule removes objects under `transfers/` after eight days.

Standalone `mix phx.server` and tests can still use local disk without R2 credentials.

Files up to R2's object limit are supported: 5 TiB minus 5 GiB (5,492,189,429,760 bytes). Files above 64 MiB use multipart uploads with three concurrent requests. Parts start at 16 MiB and grow in whole MiB increments to keep each upload within R2's 10,000-part limit. A maximum-size file uses 9,996 parts of up to 524 MiB. Each part gets a fresh signed URL and up to three attempts. Smaller files and local storage use a single PUT. R2 single PUT requests support up to 5 GiB minus 5 MiB; the 64 MiB threshold selects multipart earlier for retries and parallel uploads.

Elixir stores the upload ID and checks the sender, part list, final size, and final ETag before it shares the file. Failed uploads stop active requests and abort the R2 session. The bucket lifecycle aborts abandoned sessions after one day. Retries retain successful parts during the current upload. Reloading the page starts a new upload; cross-page resume is not implemented.

The multipart migration adds `upload_id` and `upload_part_size` to `transfers`. The release entrypoint applies migrations at startup. For standalone development, run `mix ecto.migrate` before starting the backend.

References: [Cloudflare R2 permissions and S3 credentials](https://developers.cloudflare.com/r2/api/tokens/). Multipart behavior follows [Cloudflare's upload documentation](https://developers.cloudflare.com/r2/objects/upload-objects/#multipart-upload-details). Exact byte limits follow [Cloudflare's limits footnotes](https://developers.cloudflare.com/r2/platform/limits/#footnotes).
