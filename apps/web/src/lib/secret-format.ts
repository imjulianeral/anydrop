export const maxSecretFileBytes = 100 * 1024 * 1024;
export const maxSecretMetadataBytes = 4096;
export const maxSecretCipherBytes =
  maxSecretFileBytes + maxSecretMetadataBytes + 20;
export const minSecretPasswordLength = 12;

interface SecretProfile {
  kdf: "argon2id";
  memory: 65_536;
  iterations: 3;
  parallelism: 4;
  salt: string;
}

export interface BufferedSecret extends SecretProfile {
  version: 1;
  cipher: "aes-256-gcm";
  iv: string;
}

export interface StreamSecret extends SecretProfile {
  version: 2;
  cipher: "secretstream-xchacha20poly1305";
}

export interface KeyWrap {
  alg: "ecdh-p256-hkdf-aes-gcm";
  ephemeral_public: string;
  iv: string;
  ciphertext: string;
}

export interface V3Base {
  version: 3;
  kdf: "hkdf-sha256";
  password: boolean;
  salt?: string;
  wrap?: KeyWrap;
}

export interface BufferedV3Secret extends V3Base {
  cipher: "aes-256-gcm";
  iv: string;
}

export interface StreamV3Secret extends V3Base {
  cipher: "secretstream-xchacha20poly1305";
}

export type Secret =
  | BufferedSecret
  | StreamSecret
  | BufferedV3Secret
  | StreamV3Secret;

export const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

export const fromBase64 = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), (character) => character.codePointAt(0) ?? 0);

export const isSecret = (value: unknown): value is Secret => {
  if (!value || typeof value !== "object") {
    return false;
  }
  if ("version" in value && value.version === 3) {
    return isV3Secret(value);
  }
  if (
    !hasSecretProfile(value) ||
    !("version" in value) ||
    !("cipher" in value)
  ) {
    return false;
  }
  return (
    (value.version === 1 &&
      value.cipher === "aes-256-gcm" &&
      Object.keys(value).length === 8 &&
      "iv" in value &&
      typeof value.iv === "string" &&
      validBase64(value.iv, 12)) ||
    (value.version === 2 &&
      value.cipher === "secretstream-xchacha20poly1305" &&
      Object.keys(value).length === 7)
  );
};

const hasSecretProfile = (value: object): value is SecretProfile =>
  "kdf" in value &&
  value.kdf === "argon2id" &&
  "memory" in value &&
  value.memory === 65_536 &&
  "iterations" in value &&
  value.iterations === 3 &&
  "parallelism" in value &&
  value.parallelism === 4 &&
  "salt" in value &&
  typeof value.salt === "string" &&
  validBase64(value.salt, 16);

const validBase64 = (value: string, bytes: number): boolean => {
  if (value.length !== Math.ceil(bytes / 3) * 4) {
    return false;
  }
  try {
    const decoded = fromBase64(value);
    return decoded.length === bytes && toBase64(decoded) === value;
  } catch {
    return false;
  }
};

export const validateSecretPassword = (password: string): void => {
  if (
    password.trim().length < minSecretPasswordLength ||
    password.length > 1024
  ) {
    throw new Error("Use a password or passphrase with 12–1024 characters.");
  }
};

export const isKeyWrap = (value: unknown): value is KeyWrap => {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (
    "alg" in value &&
    value.alg === "ecdh-p256-hkdf-aes-gcm" &&
    "ephemeral_public" in value &&
    typeof value.ephemeral_public === "string" &&
    validBase64(value.ephemeral_public, 91) &&
    "iv" in value &&
    typeof value.iv === "string" &&
    validBase64(value.iv, 12) &&
    "ciphertext" in value &&
    typeof value.ciphertext === "string" &&
    validBase64(value.ciphertext, 48)
  );
};

const isV3Secret = (value: object): boolean => {
  if (
    !("kdf" in value) ||
    value.kdf !== "hkdf-sha256" ||
    !("password" in value) ||
    typeof value.password !== "boolean"
  ) {
    return false;
  }
  if (value.password) {
    if (
      !("salt" in value) ||
      typeof value.salt !== "string" ||
      !validBase64(value.salt, 16)
    ) {
      return false;
    }
  } else if ("salt" in value) {
    return false;
  }
  if ("wrap" in value && !isKeyWrap(value.wrap)) {
    return false;
  }
  if (!("cipher" in value)) {
    return false;
  }
  return (
    (value.cipher === "aes-256-gcm" &&
      "iv" in value &&
      typeof value.iv === "string" &&
      validBase64(value.iv, 12)) ||
    (value.cipher === "secretstream-xchacha20poly1305" && !("iv" in value))
  );
};

export const toBase64Url = (bytes: Uint8Array): string =>
  toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

const base64UrlPattern = /^[A-Za-z0-9_-]*$/u;
export const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  if (!base64UrlPattern.test(value)) {
    throw new Error("Invalid key encoding.");
  }
  const bytes = fromBase64(value.replaceAll("-", "+").replaceAll("_", "/"));
  if (toBase64Url(bytes) !== value) {
    throw new Error("Invalid key encoding.");
  }
  return bytes;
};

export const parseFragmentKey = (
  hash: string
): Uint8Array<ArrayBuffer> | null => {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  if (value.length !== 43) {
    return null;
  }
  try {
    const bytes = fromBase64Url(value);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
};

export const unlockError =
  "Could not unlock. Check the password; the Secret may also be damaged.";
export const missingKeyError =
  "This link is missing its key. Ask the sender for the full URL, including the part after #.";
