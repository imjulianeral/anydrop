import { fromBase64, isKeyWrap, toBase64 } from "./secret-format.ts";
import type { KeyWrap } from "./secret-format.ts";

export const ECDH_STORAGE_KEY = "anyshare.device-ecdh";
const curve = { name: "ECDH", namedCurve: "P-256" };

export const loadDeviceKeyPair = async (): Promise<{
  publicSpki: string;
  privateKey: CryptoKey;
}> => {
  // Web Locks prevent two fresh tabs from publishing different identities.
  if (navigator.locks) {
    return await navigator.locks.request(ECDH_STORAGE_KEY, loadOrCreate);
  }
  return await loadOrCreate();
};

const loadOrCreate = async () => {
  const stored = localStorage.getItem(ECDH_STORAGE_KEY);
  if (stored) {
    try {
      const value: unknown = JSON.parse(stored);
      if (
        value &&
        typeof value === "object" &&
        "v" in value &&
        value.v === 1 &&
        "private" in value &&
        typeof value.private === "string" &&
        "public" in value &&
        typeof value.public === "string"
      ) {
        const privateBytes = fromBase64(value.private);
        try {
          const publicBytes = fromBase64(value.public);
          if (
            toBase64(privateBytes) !== value.private ||
            toBase64(publicBytes) !== value.public
          ) {
            throw new Error("Invalid device key encoding.");
          }
          await crypto.subtle.importKey("spki", publicBytes, curve, false, []);
          const privateKey = await crypto.subtle.importKey(
            "pkcs8",
            privateBytes,
            curve,
            false,
            ["deriveBits"]
          );
          return { publicSpki: value.public, privateKey };
        } finally {
          privateBytes.fill(0);
        }
      }
    } catch {
      /* Replace an unreadable device identity. */
    }
  }
  const pair = await crypto.subtle.generateKey(curve, true, ["deriveBits"]);
  const privateBytes = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey)
  );
  try {
    const publicSpki = toBase64(
      new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey))
    );
    localStorage.setItem(
      ECDH_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        private: toBase64(privateBytes),
        public: publicSpki,
      })
    );
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      privateBytes,
      curve,
      false,
      ["deriveBits"]
    );
    return { publicSpki, privateKey };
  } finally {
    privateBytes.fill(0);
  }
};

const wrappingKey = async (privateKey: CryptoKey, publicSpki: string) => {
  const publicKey = await crypto.subtle.importKey(
    "spki",
    fromBase64(publicSpki),
    curve,
    false,
    []
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: publicKey },
      privateKey,
      256
    )
  );
  try {
    const ikm = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
      "deriveKey",
    ]);
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(),
        info: new TextEncoder().encode("anyshare:v3:wrap"),
      },
      ikm,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } finally {
    shared.fill(0);
  }
};

export const wrapMasterKey = async (
  masterKey: Uint8Array,
  recipientSpki: string
): Promise<KeyWrap> => {
  if (masterKey.length !== 32) {
    throw new Error("Invalid master key.");
  }
  // A non-exportable private CryptoKey has no raw buffer to erase.
  const ephemeral = await crypto.subtle.generateKey(curve, false, [
    "deriveBits",
  ]);
  const publicSpki = toBase64(
    new Uint8Array(await crypto.subtle.exportKey("spki", ephemeral.publicKey))
  );
  const key = await wrappingKey(ephemeral.privateKey, recipientSpki);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new Uint8Array(masterKey)
  );
  return {
    alg: "ecdh-p256-hkdf-aes-gcm",
    ephemeral_public: publicSpki,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
};

export const unwrapMasterKey = async (
  wrap: KeyWrap,
  privateKey: CryptoKey
): Promise<Uint8Array<ArrayBuffer>> => {
  try {
    if (!isKeyWrap(wrap)) {
      throw new Error("Invalid wrap.");
    }
    const key = await wrappingKey(privateKey, wrap.ephemeral_public);
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(wrap.iv) },
        key,
        fromBase64(wrap.ciphertext)
      )
    );
  } catch {
    throw new Error("Could not unlock this transfer.");
  }
};
