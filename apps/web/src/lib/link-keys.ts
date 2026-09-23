import { shortPageUrl } from "./api.ts";
import { parseFragmentKey, toBase64Url } from "./secret-format.ts";

const storageKey = "anyshare.link-keys";
const readKeys = (): Record<string, string> => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
};

export const rememberLinkKey = (code: string, masterKey: Uint8Array): void => {
  if (masterKey.length !== 32) {
    throw new Error("Invalid link key.");
  }
  localStorage.setItem(
    storageKey,
    JSON.stringify({ ...readKeys(), [code]: toBase64Url(masterKey) })
  );
};
export const loadLinkKey = (code: string): Uint8Array<ArrayBuffer> | null =>
  parseFragmentKey(readKeys()[code] ?? "");
export const linkPageUrl = (code: string): string =>
  shortPageUrl(code, loadLinkKey(code) ?? undefined);
