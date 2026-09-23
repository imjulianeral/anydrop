import { describe, expect, it, vi } from "vitest";

import { sendBatch } from "./send-batch.ts";

describe(sendBatch, () => {
  it("continues after a failed recipient and retries only undelivered copies", async () => {
    const first = vi.fn<() => Promise<void>>().mockResolvedValue();
    const second = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue();
    const third = vi.fn<() => Promise<void>>().mockResolvedValue();
    const tasks = [first, second, third].map((send, index) => ({
      id: String(index),
      label: `Device ${index}`,
      send,
    }));
    const completed = new Set<string>();

    await expect(sendBatch(tasks, completed)).rejects.toThrow(
      "2 of 3 deliveries completed"
    );
    await sendBatch(tasks, completed);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
    expect(third).toHaveBeenCalledOnce();
    expect(completed.size).toBe(3);
  });

  it("stops queued deliveries when cancelled and can resume", async () => {
    const controller = new AbortController();
    const send = vi.fn<() => Promise<void>>().mockResolvedValue();
    const completed = new Set<string>();
    const tasks = [
      {
        id: "first",
        label: "First",
        send: () => {
          controller.abort();
          return Promise.resolve();
        },
      },
      { id: "second", label: "Second", send },
    ];
    await expect(
      sendBatch(tasks, completed, controller.signal)
    ).rejects.toThrow("Cancelled");
    expect(send).not.toHaveBeenCalled();
    await sendBatch(tasks, completed);
    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps deliveries sequential to avoid encrypting large files concurrently", async () => {
    const order: string[] = [];
    const tasks = ["first", "second"].map((id) => ({
      id,
      label: id,
      send: async () => {
        order.push(`start ${id}`);
        await Promise.resolve();
        order.push(`end ${id}`);
      },
    }));
    await sendBatch(tasks, new Set());
    expect(order).toStrictEqual([
      "start first",
      "end first",
      "start second",
      "end second",
    ]);
  });
});
