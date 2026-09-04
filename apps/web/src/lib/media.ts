export type MediaKind = "image" | "video" | "pdf" | "file";

const imageName = /\.(avif|gif|jpe?g|png|svg|webp)$/iu;
const videoName = /\.(m4v|mov|mp4|ogv|webm)$/iu;

export const mediaKind = (
  contentType: string | null | undefined,
  filename: string | null | undefined
): MediaKind => {
  const type = contentType?.toLowerCase() ?? "";
  const name = filename ?? "";

  if (type.startsWith("image/") || imageName.test(name)) {
    return "image";
  }
  if (type.startsWith("video/") || videoName.test(name)) {
    return "video";
  }
  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  return "file";
};

export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || bytes <= 0) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const initials = (name: string): string =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
