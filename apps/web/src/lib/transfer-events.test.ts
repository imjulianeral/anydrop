import { describe, expect, it } from "vitest";

import { itemExpired, limitReached } from "./expiry.ts";
import {
  applyTransferUsage,
  belongsToHistory,
  mergeTransfers,
  readTransfer,
} from "./transfer-events.ts";

const transfer = readTransfer({
  id: "file-1",
  sender_id: "sender",
  recipient_id: "recipient",
  kind: "file",
  download_count: 0,
  max_downloads: 1,
  expires_at: "2099-09-20T18:00:00Z",
  created_at: "2099-09-20T12:00:00Z",
});

describe("live transfer expiration", () => {
  it("replaces a pending upload with its completed download in either arrival order", () => {
    if (!transfer) {
      throw new Error("Invalid fixture");
    }
    const pending = { ...transfer, status: "pending" };
    const uploaded = {
      ...transfer,
      status: "uploaded",
      download: { url: "/files/completed" },
    };
    expect(mergeTransfers([pending], [uploaded])).toStrictEqual([uploaded]);
    expect(mergeTransfers([uploaded], [pending])).toStrictEqual([uploaded]);
  });

  it("keeps usage counts and completed download data when responses race", () => {
    if (!transfer) {
      throw new Error("Invalid fixture");
    }
    const pending = { ...transfer, status: "pending", download_count: 1 };
    const uploaded = {
      ...transfer,
      status: "uploaded",
      download: { url: "/files/completed" },
    };
    for (const [history, received] of [
      [pending, uploaded],
      [uploaded, pending],
    ]) {
      expect(mergeTransfers([history], [received])).toStrictEqual([
        { ...uploaded, download_count: 1 },
      ]);
    }
  });

  it("preserves group identity in live deliveries", () => {
    const incoming = readTransfer({
      id: "group-text",
      sender_id: "sender",
      recipient_id: "recipient",
      group_id: "group-1",
      kind: "text",
    });
    expect(incoming?.group_id).toBe("group-1");
  });

  it("keeps group deliveries out of direct device history", () => {
    if (!transfer) {
      throw new Error("Invalid fixture");
    }
    const grouped = { ...transfer, group_id: "group-1" };

    expect(belongsToHistory(transfer, "sender", "recipient")).toBeTruthy();
    expect(belongsToHistory(grouped, "sender", "recipient")).toBeFalsy();
    expect(
      belongsToHistory(grouped, "sender", "recipient", "group-1")
    ).toBeTruthy();
    expect(
      belongsToHistory(grouped, "recipient", "sender", "group-1")
    ).toBeTruthy();
    expect(
      belongsToHistory(grouped, "stranger", "sender", "group-1")
    ).toBeFalsy();
  });

  it("retains the item and marks its limit reached from a usage event", () => {
    if (!transfer) {
      throw new Error("Invalid fixture");
    }
    const items = applyTransferUsage([transfer], {
      type: "transfer_usage",
      id: transfer.id,
      download_count: 1,
    });
    expect(items).toHaveLength(1);
    expect(items[0].expires_at).toBe(transfer.expires_at);
    expect(
      limitReached(items[0].max_downloads, items[0].download_count)
    ).toBeTruthy();
  });

  it("does not resurrect an expired item from stale events or a stale history response", () => {
    if (!transfer) {
      throw new Error("Invalid fixture");
    }
    const exhausted = { ...transfer, download_count: 1 };
    expect(
      applyTransferUsage([exhausted], {
        type: "transfer_usage",
        id: transfer.id,
        download_count: 0,
      })
    ).toStrictEqual([exhausted]);
    expect(mergeTransfers([transfer], [exhausted])[0].download_count).toBe(1);
    expect(mergeTransfers([exhausted], [transfer])[0].download_count).toBe(1);
  });

  it("ignores unrelated and malformed events", () => {
    if (!transfer) {
      throw new Error("Invalid fixture");
    }
    for (const payload of [
      { type: "transfer_usage", id: "other", download_count: 1 },
      { type: "transfer_usage", id: transfer.id, download_count: "1" },
      { type: "transfer_usage", id: transfer.id, download_count: -1 },
      { type: "peer_joined", id: transfer.id, download_count: 1 },
    ]) {
      expect(applyTransferUsage([transfer], payload)).toStrictEqual([transfer]);
    }
  });

  it("does not mark a fresh offered file expired when the event omits its deadline", () => {
    const offered = readTransfer({
      id: "file-1",
      sender_id: "sender",
      recipient_id: "recipient",
      kind: "file",
      status: "uploaded",
      max_downloads: 1,
      download_count: 0,
    });
    if (!offered || !transfer) {
      throw new Error("Invalid fixture");
    }
    expect(offered.expires_at).toBe("");
    expect(itemExpired(offered)).toBeFalsy();
    expect(mergeTransfers([transfer], [offered])[0]?.expires_at).toBe(
      transfer.expires_at
    );
    expect(mergeTransfers([offered], [transfer])[0]?.expires_at).toBe(
      transfer.expires_at
    );
  });
});
