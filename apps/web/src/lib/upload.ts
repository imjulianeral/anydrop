import { resolveAssetUrl } from "#/lib/api.ts";

export const uploadFile = (
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (ratio: number) => void
): Promise<void> => {
  const xhr = new XMLHttpRequest();
  xhr.open("PUT", resolveAssetUrl(url));
  for (const [key, value] of Object.entries(headers)) {
    xhr.setRequestHeader(key, value);
  }

  // XHR is the only portable way to report upload progress.
  // oxlint-disable-next-line promise/avoid-new
  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload failed (${xhr.status})`));
    });
    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed"));
    });
    xhr.send(file);
  });
};
