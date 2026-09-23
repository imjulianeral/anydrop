const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const limitReached = (
  limit: number | null | undefined,
  count: number | undefined
): boolean => limit != null && limit > 0 && (count ?? 0) >= limit;

const zonedInstant = /(?:Z|[+-]\d{2}:\d{2})$/i;

export const parseInstant = (
  value: string | null | undefined
): number | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const zoned =
    zonedInstant.test(trimmed) || !trimmed.includes("T")
      ? trimmed
      : `${trimmed}Z`;
  const parsed = Date.parse(zoned);
  return Number.isNaN(parsed) ? null : parsed;
};

export const itemExpired = (
  item: {
    status?: string;
    expires_at?: string;
    max_downloads?: number | null;
    download_count?: number;
  },
  now = Date.now()
): boolean => {
  if (item.status === "expired") {
    return true;
  }
  const end = parseInstant(item.expires_at);
  if (end !== null && end <= now) {
    return true;
  }
  return limitReached(item.max_downloads, item.download_count);
};

export interface RemainingLabelOptions {
  includeSeconds?: boolean;
  format?: "phrase" | "duration";
}

export const remainingLabel = (
  expiresAt: string,
  now = Date.now(),
  options: RemainingLabelOptions = {}
): string => {
  const end = parseInstant(expiresAt);
  if (end === null) {
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

export type RemainingTone = "green" | "yellow" | "red";

const GREEN_REMAINING = 0.66;
const YELLOW_REMAINING = 0.33;

export const remainingRatio = (
  expiresAt: string,
  createdAt: string,
  now = Date.now()
): number | null => {
  const end = parseInstant(expiresAt);
  const start = parseInstant(createdAt);
  if (end === null || start === null) {
    return null;
  }
  const total = end - start;
  if (total <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (end - now) / total));
};

export const remainingTone = (ratio: number): RemainingTone => {
  if (ratio >= GREEN_REMAINING) {
    return "green";
  }
  if (ratio >= YELLOW_REMAINING) {
    return "yellow";
  }
  return "red";
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
