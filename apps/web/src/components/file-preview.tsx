import { FileIcon } from "lucide-react";

import { ButtonLink } from "#/components/motion/button/index.tsx";
import { resolveAssetUrl } from "#/lib/api.ts";
import { formatBytes, mediaKind } from "#/lib/media.ts";

interface FilePreviewProps {
  filename: string | null | undefined;
  contentType: string | null | undefined;
  byteSize?: number | null;
  downloadUrl?: string | null;
  status?: string;
}

export function FilePreview({
  filename,
  contentType,
  byteSize,
  downloadUrl,
  status,
}: FilePreviewProps) {
  const name = filename ?? "File";
  const kind = mediaKind(contentType, filename);
  const url = downloadUrl ? resolveAssetUrl(downloadUrl) : null;
  const sizeLabel = formatBytes(byteSize);

  if (!url) {
    return (
      <div className="flex items-center gap-3">
        <FileIcon aria-hidden="true" className="size-8 shrink-0" />
        <div className="flex min-w-0 flex-col">
          <p className="truncate font-medium">{name}</p>
          <p className="text-muted-foreground text-xs">
            {status === "pending" ? "Uploading…" : "Not ready"}
          </p>
        </div>
      </div>
    );
  }

  if (kind === "image") {
    return (
      <a className="block" href={url} rel="noopener" target="_blank">
        <img
          alt={name}
          className="max-h-72 w-full rounded-xl object-contain"
          src={url}
        />
      </a>
    );
  }

  if (kind === "video") {
    return (
      <video
        className="max-h-72 w-full rounded-xl bg-black"
        controls
        preload="metadata"
        src={url}
      >
        <track kind="captions" />
      </video>
    );
  }

  if (kind === "pdf") {
    return (
      <div className="flex flex-col gap-2">
        <iframe
          className="bg-background h-72 w-full rounded-xl"
          src={url}
          title={name}
        />
        <ButtonLink
          href={url}
          rel="noopener"
          size="sm"
          target="_blank"
          variant="outline"
        >
          Open PDF
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <FileIcon aria-hidden="true" className="size-8 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-medium">{name}</p>
        {sizeLabel === "" ? null : (
          <p className="text-muted-foreground text-xs">{sizeLabel}</p>
        )}
      </div>
      <ButtonLink
        download={name}
        href={url}
        rel="noopener"
        size="sm"
        variant="outline"
      >
        Download
      </ButtonLink>
    </div>
  );
}
