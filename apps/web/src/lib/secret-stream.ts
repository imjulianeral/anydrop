import { argon2id } from "hash-wasm";
import sodium from "libsodium-wrappers";
import type { StateAddress } from "libsodium-wrappers";

import {
  createV3Profile,
  deriveContentKey,
  v3AdditionalData,
} from "./secret-crypto.ts";
import type { SealOptions } from "./secret-crypto.ts";
import {
  fromBase64,
  isSecret,
  maxSecretMetadataBytes,
  toBase64,
  validateSecretPassword,
} from "./secret-format.ts";
import type { StreamV3Secret, StreamSecret } from "./secret-format.ts";
import {
  decodeFileMetadata,
  encodeFileMetadata,
  secretMagic,
  secretPrefixBytes,
  secretRecordBytes,
  secretRecordOverhead,
  streamCipherSize,
} from "./secret-stream-format.ts";
import type { SecretFileMetadata } from "./secret-stream-format.ts";

// The runtime exposes ready only on the default export.
// oxlint-disable-next-line import/no-named-as-default-member
const sodiumReady = sodium.ready;

interface StreamOptions {
  signal: AbortSignal;
  onProgress: (ratio: number) => void;
}

export interface SecretFileInfo extends SecretFileMetadata {
  prefix: string;
}

export const sealStream = async (
  file: File,
  password: string,
  sink: WritableStream<Uint8Array>,
  options: StreamOptions
): Promise<StreamSecret> => {
  validateSecretPassword(password);
  const secret: StreamSecret = {
    version: 2,
    kdf: "argon2id",
    memory: 65_536,
    iterations: 3,
    parallelism: 4,
    cipher: "secretstream-xchacha20poly1305",
    salt: toBase64(crypto.getRandomValues(new Uint8Array(16))),
  };
  return await sealStreamWithKey(
    file,
    secret,
    () => deriveStreamKey(password, secret),
    sink,
    options
  );
};

export const sealStreamV3 = async (
  file: File,
  masterKey: Uint8Array,
  sink: WritableStream<Uint8Array>,
  options: StreamOptions & SealOptions
): Promise<StreamV3Secret> => {
  const secret: StreamV3Secret = {
    ...(await createV3Profile(masterKey, options)),
    cipher: "secretstream-xchacha20poly1305",
  };
  await sodiumReady;
  return await sealStreamWithKey(
    file,
    secret,
    () => deriveContentKey(masterKey, secret, options.password),
    sink,
    options
  );
};

const sealStreamWithKey = async <T extends StreamSecret | StreamV3Secret>(
  file: File,
  secret: T,
  derive: () => Promise<Uint8Array>,
  sink: WritableStream<Uint8Array>,
  options: StreamOptions
): Promise<T> => {
  const metadata = encodeFileMetadata(file);
  const writer = sink.getWriter();
  try {
    const key = await derive();
    let stream;
    try {
      stream = sodium.crypto_secretstream_xchacha20poly1305_init_push(key);
    } finally {
      key.fill(0);
    }
    options.signal.throwIfAborted();
    const prefix = new Uint8Array(secretPrefixBytes);
    prefix.set(secretMagic);
    prefix.set(stream.header, 8);
    new DataView(prefix.buffer).setUint32(
      32,
      metadata.length + secretRecordOverhead
    );
    const aad = additionalData(secret, prefix);
    const push = (
      bytes: Uint8Array,
      tag = sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE
    ) =>
      sodium.crypto_secretstream_xchacha20poly1305_push(
        stream.state,
        bytes,
        aad,
        tag
      );
    await writer.write(prefix);
    await writer.write(push(metadata));
    for (let offset = 0; offset < file.size; offset += secretRecordBytes) {
      options.signal.throwIfAborted();
      // Await each write to keep only one plaintext record in flight.
      // oxlint-disable-next-line no-await-in-loop
      const bytes = new Uint8Array(
        // oxlint-disable-next-line no-await-in-loop
        await file.slice(offset, offset + secretRecordBytes).arrayBuffer()
      );
      if (bytes.length !== Math.min(secretRecordBytes, file.size - offset)) {
        throw new Error("The source file changed during encryption.");
      }
      try {
        // oxlint-disable-next-line no-await-in-loop
        await writer.write(push(bytes));
      } finally {
        bytes.fill(0);
      }
      options.onProgress(Math.min((offset + bytes.length) / file.size, 1));
    }
    options.signal.throwIfAborted();
    await writer.write(
      push(
        new Uint8Array(),
        sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
      )
    );
    options.signal.throwIfAborted();
    await writer.close();
    return secret;
  } catch (error) {
    await writer.abort(error).catch(() => null);
    throw error;
  } finally {
    writer.releaseLock();
  }
};

export const openStream = async (
  source: ReadableStream<Uint8Array>,
  secret: StreamSecret,
  password: string,
  options: StreamOptions & {
    sink?: WritableStream<Uint8Array>;
    expectedPrefix?: string;
    cipherBytes: number;
  }
): Promise<SecretFileInfo> =>
  await openStreamWithKey(
    source,
    secret,
    () => deriveStreamKey(password, secret),
    options
  );

export const openStreamV3 = async (
  source: ReadableStream<Uint8Array>,
  secret: StreamV3Secret,
  masterKey: Uint8Array,
  password: string | undefined,
  options: Parameters<typeof openStream>[3]
): Promise<SecretFileInfo> => {
  if (
    !isSecret(secret) ||
    secret.version !== 3 ||
    secret.cipher !== "secretstream-xchacha20poly1305"
  ) {
    throw new Error("Unsupported or invalid Secret format.");
  }
  await sodiumReady;
  return await openStreamWithKey(
    source,
    secret,
    () => deriveContentKey(masterKey, secret, password),
    options
  );
};

const openStreamWithKey = async (
  source: ReadableStream<Uint8Array>,
  secret: StreamSecret | StreamV3Secret,
  derive: () => Promise<Uint8Array>,
  options: Parameters<typeof openStream>[3]
): Promise<SecretFileInfo> => {
  const reader = source.getReader();
  const writer = options.sink?.getWriter();
  const input = new RecordReader(reader, options.signal);
  try {
    if (
      !Number.isSafeInteger(options.cipherBytes) ||
      options.cipherBytes < 71
    ) {
      throw new Error("Invalid Secret file size.");
    }
    const prefix = await input.read(secretPrefixBytes);
    if (
      !secretMagic.every((byte, index) => prefix[index] === byte) ||
      (options.expectedPrefix && options.expectedPrefix !== toBase64(prefix))
    ) {
      throw new Error("The Secret file changed or has an invalid header.");
    }
    const metadataLength = new DataView(prefix.buffer).getUint32(32);
    if (
      metadataLength <= secretRecordOverhead ||
      metadataLength > maxSecretMetadataBytes + secretRecordOverhead
    ) {
      throw new Error("Invalid Secret file metadata length.");
    }
    const key = await derive();
    let state;
    try {
      state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(
        prefix.subarray(8, 32),
        key
      );
    } finally {
      key.fill(0);
    }
    const aad = additionalData(secret, prefix);
    const metadata = decodeFileMetadata(
      pull(state, await input.read(metadataLength), aad, false)
    );
    if (
      streamCipherSize(
        metadata.byteSize,
        metadataLength - secretRecordOverhead
      ) !== options.cipherBytes
    ) {
      throw new Error("The Secret file size does not match its metadata.");
    }
    const info = { ...metadata, prefix: toBase64(prefix) };
    if (!writer) {
      return info;
    }
    for (
      let offset = 0;
      offset < metadata.byteSize;
      offset += secretRecordBytes
    ) {
      options.signal.throwIfAborted();
      const length = Math.min(secretRecordBytes, metadata.byteSize - offset);
      // oxlint-disable-next-line no-await-in-loop
      const bytes = pull(
        state,
        // oxlint-disable-next-line no-await-in-loop
        await input.read(length + secretRecordOverhead),
        aad,
        false
      );
      try {
        // oxlint-disable-next-line no-await-in-loop
        await writer.write(bytes);
      } finally {
        bytes.fill(0);
      }
      options.onProgress(Math.min((offset + length) / metadata.byteSize, 1));
    }
    pull(state, await input.read(secretRecordOverhead), aad, true);
    await input.end();
    options.signal.throwIfAborted();
    await writer.close();
    return info;
  } catch (error) {
    await writer?.abort(error).catch(() => null);
    throw error;
  } finally {
    await reader.cancel().catch(() => null);
    reader.releaseLock();
    writer?.releaseLock();
  }
};

const deriveStreamKey = async (password: string, secret: StreamSecret) => {
  if (!isSecret(secret) || secret.version !== 2) {
    throw new Error("Unsupported or invalid Secret format.");
  }
  if (!password || password.length > 1024) {
    throw new Error("Enter the password for this Secret.");
  }
  await sodiumReady;
  return await argon2id({
    password,
    salt: fromBase64(secret.salt),
    memorySize: secret.memory,
    iterations: secret.iterations,
    parallelism: secret.parallelism,
    hashLength: 32,
    outputType: "binary",
  });
};

const additionalData = (
  secret: StreamSecret | StreamV3Secret,
  prefix: Uint8Array
) => {
  const profile = new TextEncoder().encode(
    secret.version === 3
      ? v3AdditionalData(secret, "file")
      : `anyshare:secrets:2:file:argon2id:65536:3:4:secretstream-xchacha20poly1305:${secret.salt}:`
  );
  const aad = new Uint8Array(profile.length + prefix.length);
  aad.set(profile);
  aad.set(prefix, profile.length);
  return aad;
};

const pull = (
  state: StateAddress,
  bytes: Uint8Array,
  aad: Uint8Array,
  final: boolean
) => {
  const result = sodium.crypto_secretstream_xchacha20poly1305_pull(
    state,
    bytes,
    aad
  );
  const tag = final
    ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
    : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
  if (!result || result.tag !== tag || (final && result.message.length !== 0)) {
    throw new Error(
      "Could not unlock. Check the password; the Secret may also be damaged."
    );
  }
  return result.message;
};

class RecordReader {
  private pending: Uint8Array = new Uint8Array();
  private offset = 0;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private signal: AbortSignal;
  constructor(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    signal: AbortSignal
  ) {
    this.reader = reader;
    this.signal = signal;
  }

  async read(length: number): Promise<Uint8Array<ArrayBuffer>> {
    const bytes = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      this.signal.throwIfAborted();
      if (this.offset === this.pending.length) {
        // Network chunks need not align with encrypted records.
        // oxlint-disable-next-line no-await-in-loop
        const result = await this.reader.read();
        if (result.done) {
          throw new Error("The Secret file is incomplete.");
        }
        this.pending = result.value;
        this.offset = 0;
      }
      const count = Math.min(
        length - written,
        this.pending.length - this.offset
      );
      bytes.set(
        this.pending.subarray(this.offset, this.offset + count),
        written
      );
      this.offset += count;
      written += count;
    }
    return bytes;
  }

  async end(): Promise<void> {
    this.signal.throwIfAborted();
    if (this.offset !== this.pending.length) {
      throw new Error("The Secret file contains unexpected trailing data.");
    }
    const result = await this.reader.read();
    if (!result.done) {
      throw new Error("The Secret file contains unexpected trailing data.");
    }
  }
}
