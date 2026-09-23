/** A shrinking vector neck replaces a per-frame blur over the whole menu. */
const REACH = 72;

export function gooBridge(
  triggerRadius: number,
  itemRadius: number,
  distance: number,
  reach: number = REACH
): string {
  if (reach <= 0) {
    return "";
  }
  const gap = distance - triggerRadius - itemRadius;
  if (distance <= triggerRadius - itemRadius || gap >= reach) {
    return "";
  }
  const t = Math.max(0, gap) / reach;
  const smooth = t * t * t * (t * (t * 6 - 15) + 10);
  const width = itemRadius * 0.9 * (1 - smooth);
  if (width < 0.35) {
    return "";
  }
  const start = Math.sqrt(triggerRadius ** 2 - width ** 2);
  const end = distance - Math.sqrt(itemRadius ** 2 - width ** 2);
  const middle = (start + end) / 2;
  return `M ${start} ${width} C ${middle} ${width * 0.15} ${middle} ${width * 0.15} ${end} ${width} L ${end} ${-width} C ${middle} ${-width * 0.15} ${middle} ${-width * 0.15} ${start} ${-width} Z`;
}
