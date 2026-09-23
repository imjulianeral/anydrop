import type { Transfer } from "./api.ts";
import { displayFilename } from "./media.ts";

export const transferPreview = (transfer: Transfer): string => {
  if (transfer.secret) {
    return transfer.kind === "file" ? "Secret file" : "Secret message";
  }
  if (transfer.kind === "file") {
    return displayFilename(transfer.filename, "Shared file");
  }
  return transfer.body ?? "New message";
};
