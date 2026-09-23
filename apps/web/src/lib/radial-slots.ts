interface RadialAnchor {
  x: number;
  y: number;
  radius: number;
  viewportWidth: number;
  viewportHeight: number;
}

/** Fan actions below the device; fall inward when the bottom arc would clip. */
const NAME_CLEARANCE = 56;

export function topSlot(anchor: RadialAnchor, itemSize: number) {
  const marginX = itemSize / 2 + 24;
  const left = Math.min(marginX, anchor.viewportWidth / 2);
  const right = Math.max(left, anchor.viewportWidth - marginX);
  const x = Math.min(Math.max(anchor.x, left), right) - anchor.x;
  const distance = anchor.radius + itemSize / 2 + NAME_CLEARANCE;
  const y = -Math.sqrt(Math.max(0, distance * distance - x * x));
  return { x, y };
}

export function radialSlots(
  anchor: RadialAnchor,
  count: number,
  itemSize: number
) {
  const distance = anchor.radius + itemSize / 2 + NAME_CLEARANCE;
  const marginX = itemSize / 2 + 24;
  const marginTop = itemSize / 2 + 12;
  const marginBottom = itemSize / 2 + 44;
  const towardCenter = Math.atan2(
    anchor.viewportHeight / 2 - anchor.y,
    anchor.viewportWidth / 2 - anchor.x
  );
  const spread = Math.min(
    (2 * Math.PI) / 3,
    (Math.PI / 4) * Math.max(1, count - 1)
  );
  const layouts = [
    {
      start: Math.PI / 2 - spread / 2,
      step: count === 1 ? 0 : spread / (count - 1),
    },
    {
      start: towardCenter - Math.PI / 3,
      step: (2 * Math.PI) / 3 / Math.max(1, count - 1),
    },
  ];
  const candidates = layouts.map(({ start, step }) =>
    Array.from({ length: count }, (_, index) => ({
      x: Math.cos(start + index * step) * distance,
      y: Math.sin(start + index * step) * distance,
    }))
  );
  return (
    candidates.find((slots) =>
      slots.every(
        ({ x, y }) =>
          anchor.x + x >= marginX &&
          anchor.x + x <= anchor.viewportWidth - marginX &&
          anchor.y + y >= marginTop &&
          anchor.y + y <= anchor.viewportHeight - marginBottom
      )
    ) ?? candidates[1]
  );
}
