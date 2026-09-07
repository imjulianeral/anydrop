const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface RemainingLabelOptions {
  includeSeconds?: boolean;
  format?: "phrase" | "duration";
}

export const remainingLabel = (
  expiresAt: string,
  now = Date.now(),
  options: RemainingLabelOptions = {}
): string => {
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) {
    return "";
  }
  const ms = end - now;
  if (ms <= 0) {
    return "Expired";
  }
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  const seconds = Math.floor((ms % MINUTE) / SECOND);
  const includeSeconds =
    options.includeSeconds === true || options.format === "duration";
  const body = formatRemaining(days, hours, minutes, seconds, includeSeconds);
  if (options.format === "duration") {
    return body;
  }
  return `Deletes in ${body}`;
};

const formatRemaining = (
  days: number,
  hours: number,
  minutes: number,
  seconds: number,
  includeSeconds: boolean
): string => {
  if (includeSeconds) {
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};
