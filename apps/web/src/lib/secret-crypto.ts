import { argon2id } from "hash-wasm";

import { wrapMasterKey } from "./device-crypto.ts";
import {
  unlockError,
  fromBase64,
  isSecret,
  maxSecretCipherBytes,
  maxSecretFileBytes,
  maxSecretMetadataBytes,
  toBase64,
  validateSecretPassword,
} from "./secret-format.ts";
import type {
  BufferedV3Secret,
  V3Base,
  BufferedSecret,
} from "./secret-format.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const maxTextBytes = 64 * 1024;

export interface SealedSecret {
  secret: BufferedSecret;
  ciphertext: ArrayBuffer;
}

export type OpenSecret =
  | { kind: "text"; body: string }
  | { kind: "file"; filename: string; contentType: string; bytes: ArrayBuffer };

export const sealText = async (
  body: string,
  password: string
): Promise<SealedSecret> => {
  const bytes = encoder.encode(body);
  if (!body.trim() || bytes.length > maxTextBytes) {
    throw new Error("Enter a message of 64 KiB or less.");
  }
  return await seal(bytes, password, "text");
};

export const sealFile = async (
  file: File,
  password: string
): Promise<SealedSecret> => {
  const payload = await packFile(file);
  try {
    return await seal(payload, password, "file");
  } finally {
    payload.fill(0);
  }
};

const packFile = async (file: File) => {
  if (file.size > maxSecretFileBytes) {
    throw new Error("Secret files must be 100 MiB or smaller.");
  }
  const metadata = encoder.encode(
    JSON.stringify({ filename: file.name, contentType: file.type })
  );
  if (metadata.length > maxSecretMetadataBytes) {
    throw new Error("This filename is too long.");
  }
  const payload = new Uint8Array(4 + metadata.length + file.size);
  new DataView(payload.buffer).setUint32(0, metadata.length);
  payload.set(metadata, 4);
  payload.set(new Uint8Array(await file.arrayBuffer()), 4 + metadata.length);
  return payload;
};

export const openSecret = async (
  sealed: SealedSecret,
  password: string,
  kind: "text" | "file"
): Promise<OpenSecret> => {
  if (!isSecret(sealed.secret) || sealed.secret.version !== 1) {
    throw new Error("Unsupported or invalid Secret format.");
  }
  const limit = kind === "text" ? maxTextBytes + 16 : maxSecretCipherBytes;
  if (
    sealed.ciphertext.byteLength < 16 ||
    sealed.ciphertext.byteLength > limit
  ) {
    throw new Error("Invalid Secret size.");
  }
  if (!password || password.length > 1024) {
    throw new Error("Enter the password for this Secret.");
  }
  const key = await deriveKey(password, sealed.secret);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      parameters(sealed.secret, kind),
      key,
      sealed.ciphertext
    );
  } catch {
    throw new Error(
      "Could not unlock. Check the password; the Secret may also be damaged."
    );
  }
  if (kind === "text") {
    return { kind, body: decoder.decode(plaintext) };
  }
  return unpackFile(plaintext);
};

const seal = async (
  bytes: Uint8Array<ArrayBuffer>,
  password: string,
  kind: "text" | "file"
): Promise<SealedSecret> => {
  validateSecretPassword(password);
  const secret: BufferedSecret = {
    version: 1,
    kdf: "argon2id",
    memory: 65_536,
    iterations: 3,
    parallelism: 4,
    cipher: "aes-256-gcm",
    salt: toBase64(crypto.getRandomValues(new Uint8Array(16))),
    iv: toBase64(crypto.getRandomValues(new Uint8Array(12))),
  };
  const key = await deriveKey(password, secret);
  const ciphertext = await crypto.subtle.encrypt(
    parameters(secret, kind),
    key,
    bytes
  );
  return { secret, ciphertext };
};

const deriveKey = async (
  password: string,
  secret: BufferedSecret
): Promise<CryptoKey> => {
  const raw = await argon2id({
    password,
    salt: fromBase64(secret.salt),
    memorySize: secret.memory,
    iterations: secret.iterations,
    parallelism: secret.parallelism,
    hashLength: 32,
    outputType: "binary",
  });
  try {
    return await crypto.subtle.importKey(
      "raw",
      new Uint8Array(raw),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"]
    );
  } finally {
    raw.fill(0);
  }
};

const parameters = (
  secret: BufferedSecret,
  kind: "text" | "file"
): AesGcmParams => ({
  name: "AES-GCM",
  iv: fromBase64(secret.iv),
  tagLength: 128,
  additionalData: encoder.encode(
    `anyshare:secrets:1:${kind}:argon2id:65536:3:4:aes-256-gcm:${secret.salt}`
  ),
});

const unpackFile = (plaintext: ArrayBuffer): OpenSecret => {
  if (plaintext.byteLength < 4) {
    throw new Error("Invalid Secret file.");
  }
  const length = new DataView(plaintext).getUint32(0);
  if (
    length > maxSecretMetadataBytes ||
    length + 4 > plaintext.byteLength ||
    plaintext.byteLength - length - 4 > maxSecretFileBytes
  ) {
    throw new Error("Invalid Secret file metadata.");
  }
  const metadata: unknown = JSON.parse(
    decoder.decode(plaintext.slice(4, length + 4))
  );
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("filename" in metadata) ||
    typeof metadata.filename !== "string" ||
    !("contentType" in metadata) ||
    typeof metadata.contentType !== "string"
  ) {
    throw new Error("Invalid Secret file metadata.");
  }
  return {
    kind: "file",
    filename: metadata.filename,
    contentType: metadata.contentType,
    bytes: plaintext.slice(length + 4),
  };
};

export interface SealOptions {
  password?: string;
  recipientPublicKey?: string;
}

export interface SealedV3Secret {
  secret: BufferedV3Secret;
  ciphertext: ArrayBuffer;
  masterKey: Uint8Array<ArrayBuffer>;
}

export const createV3Profile = async (
  masterKey: Uint8Array,
  options: SealOptions
): Promise<V3Base> => {
  const profile: V3Base = {
    version: 3,
    kdf: "hkdf-sha256",
    password: options.password !== undefined,
  };
  if (options.password !== undefined) {
    validateSecretPassword(options.password);
    profile.salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  }
  if (options.recipientPublicKey) {
    profile.wrap = await wrapMasterKey(masterKey, options.recipientPublicKey);
  }
  return profile;
};

export const deriveContentKey = async (
  masterKey: Uint8Array,
  secret: V3Base,
  password?: string
): Promise<Uint8Array<ArrayBuffer>> => {
  if (masterKey.length !== 32) {
    throw new Error(unlockError);
  }
  let salt = new Uint8Array();
  if (secret.password) {
    if (!password || password.length > 1024 || !secret.salt) {
      throw new Error(unlockError);
    }
    salt = new Uint8Array(
      await argon2id({
        password,
        salt: fromBase64(secret.salt),
        memorySize: 65_536,
        iterations: 3,
        parallelism: 4,
        hashLength: 32,
        outputType: "binary",
      })
    );
  }
  try {
    const ikm = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(masterKey),
      "HKDF",
      false,
      ["deriveBits"]
    );
    return new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new Uint8Array(salt),
          info: encoder.encode("anyshare:v3:content"),
        },
        ikm,
        256
      )
    );
  } finally {
    salt.fill(0);
  }
};

export const v3AdditionalData = (
  secret: V3Base & { cipher: string },
  kind: "text" | "file"
) =>
  `anyshare:secrets:3:${kind}:hkdf-sha256:${secret.cipher}:${secret.password ? "pw" : "nopw"}:${secret.salt ?? ""}`;

const v3Parameters = (
  secret: BufferedV3Secret,
  kind: "text" | "file"
): AesGcmParams => ({
  name: "AES-GCM",
  iv: fromBase64(secret.iv),
  tagLength: 128,
  additionalData: encoder.encode(v3AdditionalData(secret, kind)),
});

const contentAesKey = async (
  masterKey: Uint8Array,
  secret: V3Base,
  password?: string
) => {
  const raw = await deriveContentKey(masterKey, secret, password);
  try {
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  } finally {
    raw.fill(0);
  }
};

const sealV3 = async (
  bytes: Uint8Array<ArrayBuffer>,
  kind: "text" | "file",
  options: SealOptions
): Promise<SealedV3Secret> => {
  const masterKey = crypto.getRandomValues(new Uint8Array(32));
  try {
    const secret: BufferedV3Secret = {
      ...(await createV3Profile(masterKey, options)),
      cipher: "aes-256-gcm",
      iv: toBase64(crypto.getRandomValues(new Uint8Array(12))),
    };
    const key = await contentAesKey(masterKey, secret, options.password);
    const ciphertext = await crypto.subtle.encrypt(
      v3Parameters(secret, kind),
      key,
      bytes
    );
    return { secret, ciphertext, masterKey };
  } catch (error) {
    masterKey.fill(0);
    throw error;
  }
};

export const sealTextV3 = async (
  body: string,
  options: SealOptions = {}
): Promise<SealedV3Secret> => {
  const bytes = encoder.encode(body);
  if (!body.trim() || bytes.length > maxTextBytes) {
    throw new Error("Enter a message of 64 KiB or less.");
  }
  try {
    return await sealV3(bytes, "text", options);
  } finally {
    bytes.fill(0);
  }
};

export const sealFileV3 = async (
  file: File,
  options: SealOptions = {}
): Promise<SealedV3Secret> => {
  const bytes = await packFile(file);
  try {
    return await sealV3(bytes, "file", options);
  } finally {
    bytes.fill(0);
  }
};

export const openSecretV3 = async (
  sealed: { secret: BufferedV3Secret; ciphertext: ArrayBuffer },
  masterKey: Uint8Array,
  password: string | undefined,
  kind: "text" | "file"
): Promise<OpenSecret> => {
  if (
    !isSecret(sealed.secret) ||
    sealed.secret.version !== 3 ||
    sealed.secret.cipher !== "aes-256-gcm"
  ) {
    throw new Error("Unsupported or invalid Secret format.");
  }
  const limit = kind === "text" ? maxTextBytes + 16 : maxSecretCipherBytes;
  if (
    sealed.ciphertext.byteLength < 16 ||
    sealed.ciphertext.byteLength > limit
  ) {
    throw new Error("Invalid Secret size.");
  }
  const key = await contentAesKey(masterKey, sealed.secret, password);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      v3Parameters(sealed.secret, kind),
      key,
      sealed.ciphertext
    );
  } catch {
    throw new Error(unlockError);
  }
  try {
    return kind === "text"
      ? { kind, body: decoder.decode(plaintext) }
      : unpackFile(plaintext);
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
};
