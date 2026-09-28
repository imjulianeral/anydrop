import { describe, expect, test } from "vitest";

import {
  claimablePeers,
  mergeClaim,
  pendingClaims,
} from "#/lib/account-devices.ts";
import type { DeviceClaim, Peer } from "#/lib/api.ts";

const peer = (id: string, overrides: Partial<Peer> = {}): Peer => ({
  id,
  public_key: null,
  display_name: id,
  device_kind: "desktop",
  room_code: null,
  last_seen_at: "2026-09-27T00:00:00Z",
  ...overrides,
});

const claim = (
  id: string,
  status: DeviceClaim["status"],
  expiresAt = "2026-09-27T00:10:00Z"
): DeviceClaim => ({
  id,
  name: "Work laptop",
  status,
  expires_at: expiresAt,
  requester: { name: "Ada" },
  requested_by: peer("phone"),
  target: peer("laptop"),
});

const now = Date.parse("2026-09-27T00:05:00Z");

describe("device claims", () => {
  test("keeps only unanswered, unexpired requests", () => {
    const claims = [
      claim("live", "pending"),
      claim("expired", "pending", "2026-09-27T00:01:00Z"),
      claim("accepted", "accepted"),
      claim("declined", "declined"),
    ];
    expect(pendingClaims(claims, now).map((item) => item.id)).toStrictEqual([
      "live",
    ]);
  });

  test("an answer from the other device removes the request", () => {
    const merged = mergeClaim(
      [claim("one", "pending")],
      claim("one", "accepted")
    );
    expect(merged).toStrictEqual([]);
  });
});

describe("claimable peers", () => {
  test("only unsaved devices on this network can be asked", () => {
    const peers = [
      peer("nearby", { relation: "nearby", saved: false }),
      peer("friend", { relation: "nearby", saved: true }),
      peer("mine", { relation: "mine", saved: true }),
      peer("teammate", { relation: "team", saved: true }),
      peer("unknown"),
    ];
    expect(claimablePeers(peers).map((item) => item.id)).toStrictEqual([
      "nearby",
    ]);
  });
});
