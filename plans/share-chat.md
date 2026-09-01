# Share page as a chat UI

## Context

Share is a device grid plus a send sheet. Incoming text is a toast; incoming files auto-open. Transfers already live in Postgres (`sender_id`, optional `recipient_id`, text or file, 24-hour `expires_at`) but there is no list API, so history dies on reload.

Goal: chat-style Share — nearby devices on the left, that pair’s files and messages on the right — and history that survives reload until the existing 24-hour TTL. Move recipient-less “Share a link” drops to the Links page.

## Approach

**Decided**

- History survives reload; keep the 24-hour transfer TTL. No schema/TTL change.
- Left list is nearby/online devices only. Offline chats stay hidden until that device returns.
- “Share a link” (no recipient) moves to Links. Share is 1:1 only.

**Build**

- Left: nearby peer list. Compact this-device / room / QR header above it (slim down `SelfCard`, do not keep it as the main column).
- Right: transcript for the selected peer, composer at the bottom. Empty state until a peer is selected.
- Replace `SendSheet` with an inline composer (textarea, attach, drag-and-drop on the pane).
- `GET /api/v1/transfers?peer_id=` returns this device’s live transfers with that peer, oldest-first, including download URLs for ready files.
- On select, load that list. On send and on Cable `text_received` / `transfer_offered`, append to the open thread. Do not auto-open downloads; do not toast when the item belongs in a thread.
- 1:1 send does not copy `/s/{code}` to the clipboard. The thread is the record. Backend may still mint short links (Links recents already lists them).
- Links page: keep URL shorten + recents; add the current no-recipient file/message composer; copy `/s/{code}` on those drops.

## Files to modify

### Backend

- `apps/backend/config/routes.rb` — `resources :transfers, only: [:index, :create, :show]`
- `apps/backend/app/controllers/api/v1/transfers_controller.rb` — authenticated `index`

### Web — Share

- `apps/web/src/components/share-app.tsx` — chat shell, history load, live append
- `apps/web/src/components/peer-tile.tsx` — list row (selected state) instead of a tile card
- `apps/web/src/components/self-card.tsx` — compact left-header treatment
- `apps/web/src/components/send-sheet.tsx` — delete after composer + Links drop UI exist
- `apps/web/src/components/chat-thread.tsx` — **new** transcript + bubbles
- `apps/web/src/components/chat-composer.tsx` — **new** message/file composer
- `apps/web/src/lib/api.ts` — `listTransfers(token, peerId)`

### Web — Links

- `apps/web/src/components/links-page.tsx` — add no-recipient file/message drop; copy short URL

No change to `/s/$code`, session layout, or sidebar.

## Reuse

- `createTextTransfer`, `createFileTransfer`, `completeTransfer`, `getTransfer`, `Transfer` in `apps/web/src/lib/api.ts`
- Cable `connectRoom` and peer join/leave in `apps/web/src/components/share-app.tsx`
- `visible_transfer` / `as_json_for` / download presign in `transfers_controller.rb`
- `Transfer.active`, `TTL = 24.hours`, `expire_stale!`
- Send-sheet drop zone + textarea + progress (`send-sheet.tsx`) — lift into composer and Links
- UI: `Avatar`, `Button`, `Empty`, `Textarea`, `Progress`, `Badge`, `Input`
- Do not add a shadcn chat kit; match existing rounded-3xl card language

## API

`GET /api/v1/transfers?peer_id=<device-id>`

- Auth required
- `peer_id` required
- Rows: `expires_at > now`, status not `expired`/`failed`, and
  `(sender_id = me AND recipient_id = peer) OR (sender_id = peer AND recipient_id = me)`
- Order `created_at asc`
- Each item: `as_json_for(current_device)` plus `download: { url }` when the file is `uploaded`/`delivered` and has `r2_key`

Do not require the peer to still be online for the query (so a thread stays loaded if they drop mid-view). The UI only *opens* threads from the nearby list.

## UI

**Left column**

- Slim self/room header (name, live badge, room code, join/create, QR available)
- Scrollable nearby list: avatar, name, device kind; selected row uses `secondary`/`bg-muted`
- Existing empty “No other devices yet”

**Right column**

- Header: selected peer name
- Scrollable bubbles, oldest at top
  - Mine on the right, theirs on the left
  - Text: body
  - File: filename + download button (no auto-open)
- Composer: textarea, send, attach, drop files on the pane; show upload `Progress`
- Empty: “Select a device to start sharing”

**Links**

- Existing shorten form + recents
- New “Share a drop” block: message field + file drop (no recipient). On success, copy `/s/{code}` and prepend to recents

## Steps

- [ ] Add `transfers#index` filtered by `peer_id` and live TTL/status
- [ ] Add `listTransfers` in the web API client
- [ ] Rebuild Share as left peer list + right thread; compact self/room header
- [ ] Inline composer; remove `SendSheet` from Share
- [ ] Load history on peer select; append sends and Cable events; stop toasts/auto-download
- [ ] Move no-recipient file/text drop onto Links; copy short URL there
- [ ] Delete `send-sheet.tsx` once both composers exist

## Verification

- Two nearby devices: select the other, send text and a file; both appear in the right pane on both sides
- Reload while the peer is still nearby: the same thread comes back
- After 24 hours (or expired status): items disappear from the thread
- Peer going offline removes them from the left list; no leftover offline rows
- Files in-thread download on click; they do not auto-open a new tab
- Share has no “Share a link” button
- Links: shorten URL still works; file/message drop copies `/s/{code}` and shows in recents
- `/s/{code}` and the app sidebar are unchanged
