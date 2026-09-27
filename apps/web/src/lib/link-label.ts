import type { ShortLink } from "#/lib/api.ts";
import { displayFilename } from "#/lib/media.ts";

export const linkLabel = (link: ShortLink): string => {
  if (link.secret) {
    return link.kind === "file" ? "Secret file" : "Secret message";
  }
  if (link.kind === "url") {
    return link.url ?? "URL";
  }
  if (link.kind === "text") {
    const body = link.body?.trim();
    return body === undefined || body === "" ? "Message" : body;
  }
  return displayFilename(link.filename);
};
