const STORAGE_KEY = "anyshare.device";

const adjectives = [
  "Amber",
  "Azure",
  "Bold",
  "Bright",
  "Calm",
  "Coral",
  "Cosmic",
  "Ember",
  "Fern",
  "Frost",
  "Golden",
  "Ivory",
  "Jade",
  "Lunar",
  "Moss",
  "Nova",
  "Olive",
  "Pearl",
  "Quiet",
  "Sage",
  "Silver",
  "Solar",
  "Swift",
  "Velvet",
] as const;

const animals = [
  "Badger",
  "Crane",
  "Dove",
  "Finch",
  "Fox",
  "Hare",
  "Heron",
  "Ibis",
  "Jay",
  "Lynx",
  "Moose",
  "Otter",
  "Owl",
  "Puma",
  "Raven",
  "Seal",
  "Sparrow",
  "Tern",
  "Wolf",
  "Wren",
] as const;

export type DeviceKind = "phone" | "tablet" | "desktop";

export interface LocalDevice {
  id: string;
  displayName: string;
  deviceKind: DeviceKind;
}

export const generateDisplayName = (): string => {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adjective ?? "Amber"} ${animal ?? "Fox"}`;
};

export const detectDeviceKind = (
  userAgent = globalThis.navigator?.userAgent ?? ""
): DeviceKind => {
  if (/iPad|Tablet/iu.test(userAgent)) {
    return "tablet";
  }
  if (/Mobi|Android|iPhone|iPod/iu.test(userAgent)) {
    return "phone";
  }
  return "desktop";
};

export const loadLocalDevice = (): LocalDevice => {
  const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<LocalDevice>;
      if (parsed.id && parsed.displayName && parsed.deviceKind) {
        return {
          id: parsed.id,
          displayName: parsed.displayName,
          deviceKind: parsed.deviceKind,
        };
      }
    } catch {
      // Fall through and mint a new identity.
    }
  }

  const device: LocalDevice = {
    id: crypto.randomUUID(),
    displayName: generateDisplayName(),
    deviceKind: detectDeviceKind(),
  };
  saveLocalDevice(device);
  return device;
};

export const saveLocalDevice = (device: LocalDevice): void => {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(device));
};
