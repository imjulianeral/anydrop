# Split Share and Links pages

## Context

The web app is a single page at `/` (`ShareApp`). Nearby sharing, rooms, and the URL shortener all live together. The shortener is a form at the bottom of `SelfCard` that calls `POST /api/v1/short_links`.

Goal: put a 2-button sidebar on the app. Share keeps nearby-device sharing. Links gets URL shortening plus this device’s recent live short links (URL, file, and text).

Public drop pages at `/s/$code` stay as they are. No sidebar there.

## Approach

Keep Share at `/` so `/?room=CODE` invites still work. Add `/links`. Wrap both in a TanStack Router pathless layout that boots the device session once and renders a slim 2-button sidebar.

Session must live in that layout. `POST /api/v1/sessions` issues a new token and overwrites `token_digest`, so a second boot on `/links` would invalidate Share’s socket.

ActionCable stays on Share only. Links only needs the bearer token.

Links recents: every live short link owned by this device, newest first — URL shorts, invite URLs, and file/text share drops.

Do not add the full shadcn Sidebar kit. Two `Button` + TanStack `Link` items is enough.

## Files to modify

### Backend

- `apps/backend/config/routes.rb` — `resources :short_links, only: [:index, :create, :show]`
- `apps/backend/app/controllers/api/v1/short_links_controller.rb` — authenticated `index`

### Web

- `apps/web/src/routes/__root.tsx` — unchanged role (toaster/devtools). No sidebar.
- `apps/web/src/routes/_app.tsx` — **new** pathless layout: session provider, sidebar, `<Outlet />`
- `apps/web/src/routes/_app/index.tsx` — Share at `/` (replace `routes/index.tsx`)
- `apps/web/src/routes/_app/links.tsx` — Links at `/links`
- `apps/web/src/routes/index.tsx` — **delete** after the move
- `apps/web/src/components/app-session.tsx` — **new** session boot + React context (`token`, `self`, `peers`, `connected`, `rename`, `joinRoom`, `applySession`)
- `apps/web/src/components/app-sidebar.tsx` — **new** two-button nav
- `apps/web/src/components/share-app.tsx` — consume session context; keep peers, send sheet, room UI; drop page-level session boot and min-h-svh shell the layout owns
- `apps/web/src/components/self-card.tsx` — remove “Shorten a URL”; keep rename/room/QR/invite
- `apps/web/src/components/links-page.tsx` — **new** shorten form + recents list
- `apps/web/src/lib/api.ts` — `listShortLinks(token)`
- `apps/web/src/routeTree.gen.ts` — regenerated

## Reuse

- `createShortLink`, `getShortLink`, `ShortLink` in `apps/web/src/lib/api.ts`
- Form logic in `apps/web/src/components/self-card.tsx` (`shortenUrl`, `shortPageUrl`) — move `shortPageUrl` next to the API helpers so Share invite copy and Links share it
- Session boot in `apps/web/src/components/share-app.tsx` (`createSession`, `updateDevice`, `connectRoom`)
- `ShortLink.live`, `as_json_payload`, `Device#short_links`
- UI: `Button`, `Field`, `Input`, `Empty`, `Badge`, `Separator`
- Public resolver: `apps/web/src/routes/s.$code.tsx` (untouched)

## API

`GET /api/v1/short_links`

- `before_action :authenticate_device!` on `index` and `create`; `show` stays public
- Query: `current_device.short_links.live.includes(:transfer).order(created_at: :desc)`
- Body: `{ short_links: current_device.short_links...map(&:as_json_payload) }`
- No pagination for v1 (7-day TTL keeps this bounded)

`as_json_payload` already has `code`, `kind`, `url` / `body` / `filename`, `expires_at`, optional `download`.

## UI

**Shell (`_app`)**

- `min-h-svh` row: sidebar + main outlet
- Sidebar: brand label, then two buttons — Share (`/`), Links (`/links`)
- Active route uses the outline/secondary button state via TanStack `Link` `activeProps`
- Same dark radial background currently on `ShareApp`, so both pages match

**Share (`/`)**

- Current nearby-devices UI
- No shortener field on `SelfCard`
- Invite link copy still calls `createShortLink` (that link will show up under Links)

**Links (`/links`)**

- “Shorten a URL” field + Shorten button (moved from `SelfCard`)
- On success: copy `/s/{code}`, prepend the new row
- Recents list below: kind badge (`url` / `text` / `file`), primary label (target URL, message snippet, or filename), mono short URL, copy button
- Empty state via existing `Empty` when the device has no live links

## Steps

- [ ] Add authenticated `index` on `Api::V1::ShortLinksController` and allow it in routes
- [ ] Add `listShortLinks` in `apps/web/src/lib/api.ts`; export `shortPageUrl`
- [ ] Extract session boot into `AppSessionProvider`; layout wraps Share and Links
- [ ] Add `app-sidebar` with Share and Links buttons
- [ ] Move `routes/index.tsx` → `routes/_app/index.tsx`; add `routes/_app.tsx` and `routes/_app/links.tsx`
- [ ] Strip shortener from `SelfCard`; strip session/shell from `ShareApp`
- [ ] Build Links page: form, list fetch, prepend on create, copy per row
- [ ] Leave `/s/$code` as a root child (no sidebar)

## Verification

- `/` shows Share, sidebar, and no “Shorten a URL” on the device card
- Sidebar Share / Links switches pages; the active button is obvious
- `/links` shortens a URL, copies `/s/{code}`, and shows the new row
- Reload `/links`: live links for this device still appear, including file/text drops minted from Share
- Share a file or text on `/`, then open `/links`: that drop’s code is in the list
- `/?room=CODE` still joins the room
- `/s/{code}` still resolves URL/text/file with no sidebar
- Invite link on Share still copies a short join URL
- Switching Share ↔ Links does not drop the live badge (same token, cable only on Share)

## Out of scope

- Delete / expire / edit / custom codes
- Full shadcn Sidebar (icon rail, mobile sheet, cookies)
- Changing `/s/$code` behavior
