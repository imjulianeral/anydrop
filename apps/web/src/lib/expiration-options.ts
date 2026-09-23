export interface ExpirationOptions {
  expiresIn: number;
  maxDownloads: number | null;
}

export const defaultExpiration: ExpirationOptions = {
  expiresIn: 6 * 60 * 60,
  maxDownloads: null,
};

export const expirationDurations = [
  { value: 3600, label: "1 hour" },
  { value: 21_600, label: "6 hours" },
  { value: 43_200, label: "12 hours" },
  { value: 86_400, label: "24 hours" },
  { value: 604_800, label: "7 days" },
];

export const expirationCounts = [1, 5, 10, 25, 100];
