import { FileIcon, FileImage, FileText, FileVideoCamera } from "lucide-react";

import { ButtonLink } from "#/components/motion/button/index.tsx";
import { resolveAssetUrl } from "#/lib/api.ts";
import { formatBytes, mediaKind, type MediaKind } from "#/lib/media.ts";

const kindIcons = {
  image: FileImage,
  video: FileVideoCamera,
  pdf: FileText,
  file: FileIcon,
} as const satisfies Record<MediaKind, typeof FileIcon>;

interface FilePreviewProps {
  filename: string | null | undefined;
  contentType: string | null | undefined;
  byteSize?: number | null;
  downloadUrl?: string | null;
  trackDownloadUrl?: string | null;
  showDownload?: boolean;
  status?: string;
}

export function FilePreview({
  filename,
  contentType,
  byteSize,
  downloadUrl,
  trackDownloadUrl,
  showDownload = true,
  status,
}: FilePreviewProps) {
  const name = filename ?? "File";
  const kind = mediaKind(contentType, filename);
  const Icon = kindIcons[kind];
  const url = downloadUrl ? resolveAssetUrl(downloadUrl) : null;
  const trackedUrl = trackDownloadUrl ? resolveAssetUrl(trackDownloadUrl) : url;
  const sizeLabel = formatBytes(byteSize);
  const notReadyLabel = status === "pending" ? "Uploading…" : "Not ready";
  const detail = url ? sizeLabel : notReadyLabel;

  return (
    <div className="flex items-center gap-3">
      <Icon aria-hidden="true" className="size-8 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-medium">{name}</p>
        {detail === "" ? null : (
          <p className="text-muted-foreground text-xs">{detail}</p>
        )}
      </div>
      {showDownload && url ? (
        <ButtonLink
          href={trackedUrl ?? undefined}
          rel="noopener"
          size="sm"
          target="_blank"
          variant="outline"
        >
          Download
        </ButtonLink>
      ) : null}
    </div>
  );
}
