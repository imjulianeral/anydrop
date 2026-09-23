import { expect, it } from "vitest";

import { radialSlots, topSlot } from "./radial-slots.ts";

it("fans actions below the device without overlapping it or one another", () => {
  const slots = radialSlots(
    { x: 640, y: 400, radius: 88, viewportWidth: 1280, viewportHeight: 800 },
    3,
    64
  );
  expect(slots).toHaveLength(3);
  for (const slot of slots) {
    expect(slot.y).toBeGreaterThan(50);
    expect(Math.hypot(slot.x, slot.y)).toBeGreaterThan(88 + 32);
    for (const other of slots.filter((candidate) => candidate !== slot)) {
      expect(Math.hypot(slot.x - other.x, slot.y - other.y)).toBeGreaterThan(
        64
      );
    }
  }
  expect(slots.some(({ x }) => x < -50)).toBe(true);
  expect(slots.some(({ x }) => x > 50)).toBe(true);
});

it("places both actions below the device name", () => {
  const radius = 88;
  const itemSize = 64;
  const slots = radialSlots(
    { x: 640, y: 400, radius, viewportWidth: 1280, viewportHeight: 800 },
    2,
    itemSize
  );
  expect(slots).toHaveLength(2);
  for (const slot of slots) {
    expect(slot.y - itemSize / 2).toBeGreaterThan(radius + 36);
  }
  expect(slots.some(({ x }) => x < 0)).toBe(true);
  expect(slots.some(({ x }) => x > 0)).toBe(true);
});

it.each([20, 195, 370])(
  "keeps actions and labels in the mobile viewport at x=%s",
  (x) => {
    const anchor = {
      x,
      y: 422,
      radius: x === 195 ? 88 : 57,
      viewportWidth: 390,
      viewportHeight: 844,
    };
    for (const slot of radialSlots(anchor, 3, 64)) {
      expect(anchor.x + slot.x - 56).toBeGreaterThanOrEqual(0);
      expect(anchor.x + slot.x + 56).toBeLessThanOrEqual(390);
      expect(anchor.y + slot.y - 44).toBeGreaterThanOrEqual(0);
      expect(anchor.y + slot.y + 76).toBeLessThanOrEqual(844);
    }
  }
);

it.each([20, 195, 370])(
  "keeps the top action and label inside the mobile viewport at x=%s",
  (x) => {
    const anchor = {
      x,
      y: 422,
      radius: x === 195 ? 88 : 57,
      viewportWidth: 390,
      viewportHeight: 844,
    };
    const slot = topSlot(anchor, 64);
    expect(slot.y).toBeLessThan(0);
    expect(anchor.x + slot.x - 56).toBeGreaterThanOrEqual(0);
    expect(anchor.x + slot.x + 56).toBeLessThanOrEqual(390);
    expect(anchor.y + slot.y - 44).toBeGreaterThanOrEqual(0);
  }
);
