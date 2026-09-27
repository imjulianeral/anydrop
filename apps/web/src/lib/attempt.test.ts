import { describe, expect, it, vi } from "vitest";

import { attempt } from "./attempt.ts";

describe(attempt, () => {
  it("returns the task result and settles", async () => {
    const onSettled = vi.fn<() => void>();
    await expect(
      attempt(() => Promise.resolve(1), { onSettled })
    ).resolves.toBe(1);
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it("returns the error handler result and settles after it", async () => {
    const calls: string[] = [];
    const result = await attempt(() => Promise.reject(new Error("boom")), {
      onError: (error) => {
        calls.push("error");
        return error instanceof Error ? error.message : "";
      },
      onSettled: () => calls.push("settled"),
    });
    expect(result).toBe("boom");
    expect(calls).toStrictEqual(["error", "settled"]);
  });

  it("rethrows without an error handler, after settling", async () => {
    const onSettled = vi.fn<() => void>();
    await expect(
      attempt(() => Promise.reject(new Error("boom")), { onSettled })
    ).rejects.toThrow("boom");
    expect(onSettled).toHaveBeenCalledOnce();
  });
});
