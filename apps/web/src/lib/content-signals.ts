import { createMD5, createSHA256 } from "hash-wasm";

/**
 * Plaintext hashes the server matches against known-bad lists (NCMEC, StopNCII,
 * MalwareBazaar). The server keeps them only when they match.
 */
export interface ContentSignals {
  md5: string;
  sha256: string;
}

export interface SignalHasher {
  update: (bytes: Uint8Array) => void;
  digest: () => ContentSignals;
}

const hashChunkBytes = 8 * 1024 * 1024;

export const createSignalHasher = async (): Promise<SignalHasher> => {
  const [md5, sha256] = await Promise.all([createMD5(), createSHA256()]);
  md5.init();
  sha256.init();
  return {
    update: (bytes) => {
      md5.update(bytes);
      sha256.update(bytes);
    },
    digest: () => ({ md5: md5.digest("hex"), sha256: sha256.digest("hex") }),
  };
};

export const hashFile = async (file: Blob): Promise<ContentSignals> => {
  const hasher = await createSignalHasher();
  for (let offset = 0; offset < file.size; offset += hashChunkBytes) {
    // Read one chunk at a time so large files never sit in memory twice.
    // oxlint-disable-next-line no-await-in-loop
    const chunk = await file
      .slice(offset, offset + hashChunkBytes)
      .arrayBuffer();
    hasher.update(new Uint8Array(chunk));
  }
  return hasher.digest();
};
