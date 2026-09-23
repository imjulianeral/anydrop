import { maxFileBytes } from "./config.ts";
import { maxSecretMetadataBytes } from "./secret-format.ts";

export const secretRecordBytes = 1024 * 1024;
export const secretRecordOverhead = 17;
export const secretPrefixBytes = 36;
export const secretMagic = new TextEncoder().encode("ANYSECR2");

export interface SecretFileMetadata {
  filename: string;
  contentType: string;
  byteSize: number;
}

export const streamCipherSize = (
  bytes: number,
  metadataBytes: number
): number => {
  const size =
    bytes + metadataBytes + 70 + 17 * Math.ceil(bytes / secretRecordBytes);
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    !Number.isSafeInteger(metadataBytes) ||
    metadataBytes < 1 ||
    metadataBytes > maxSecretMetadataBytes ||
    size > maxFileBytes
  ) {
    throw new Error("This Secret exceeds the encrypted file size limit.");
  }
  return size;
};

export const encodeFileMetadata = (file: File): Uint8Array<ArrayBuffer> => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      filename: file.name,
      contentType: file.type,
      byteSize: file.size,
    } satisfies SecretFileMetadata)
  );
  streamCipherSize(file.size, bytes.length);
  return bytes;
};

export const decodeFileMetadata = (bytes: Uint8Array): SecretFileMetadata => {
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  );
  if (
    !value ||
    typeof value !== "object" ||
    !("filename" in value) ||
    typeof value.filename !== "string" ||
    !("contentType" in value) ||
    typeof value.contentType !== "string" ||
    !("byteSize" in value) ||
    typeof value.byteSize !== "number"
  ) {
    throw new Error("Invalid Secret file metadata.");
  }
  streamCipherSize(value.byteSize, bytes.length);
  return {
    filename: value.filename,
    contentType: value.contentType,
    byteSize: value.byteSize,
  };
};
