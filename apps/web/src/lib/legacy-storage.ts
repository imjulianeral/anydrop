// Browser storage written before the AnyShare → Phemera rename. Moving it keeps
// the device identity, its keys, saved link keys and the theme choice.
const renamedKeys = [
  ["anyshare.device", "phemera.device"],
  ["anyshare.device-ecdh", "phemera.device-ecdh"],
  ["anyshare.link-keys", "phemera.link-keys"],
  ["anyshare.theme", "phemera.theme"],
] as const;

const renamedSessionKeys = [
  ["anyshare:account-view", "phemera:account-view"],
] as const;

const legacyStagingName = "anyshare-secret-staging";

const moveKeys = (
  storage: Storage,
  keys: readonly (readonly [string, string])[]
) => {
  for (const [from, to] of keys) {
    const value = storage.getItem(from);
    if (value === null) {
      continue;
    }
    if (storage.getItem(to) === null) {
      storage.setItem(to, value);
    }
    storage.removeItem(from);
  }
};

// Old tabs hold the staging lock while they write there, so skip it until
// they finish.
const removeLegacyStaging = async () => {
  if (!navigator.storage?.getDirectory || !navigator.locks) {
    return;
  }
  await navigator.locks.request(
    legacyStagingName,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        return;
      }
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(legacyStagingName, { recursive: true });
    }
  );
};

export const migrateLegacyStorage = () => {
  try {
    moveKeys(localStorage, renamedKeys);
    moveKeys(sessionStorage, renamedSessionKeys);
  } catch {
    // Storage can be blocked; the app then starts fresh as before.
  }
  removeLegacyStaging().catch(() => {
    // Nothing left over, or private storage is unavailable.
  });
};
