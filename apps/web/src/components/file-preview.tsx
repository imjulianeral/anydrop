import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  ActionSwapCascadeButton,
  type ActionSwapItem,
} from "#/components/motion/action-swap-cascade.tsx";
import {
  Check,
  Download,
  FileIcon,
  FileImage,
  FileText,
  FileVideoCamera,
} from "#/components/rune-icons.tsx";
import { resolveAssetUrl, savingDownloadUrl } from "#/lib/api.ts";
import { displayFilename, formatBytes, mediaKind } from "#/lib/media.ts";
import type { MediaKind } from "#/lib/media.ts";

const kindIcons = {
  image: FileImage,
  video: FileVideoCamera,
  pdf: FileText,
  file: FileIcon,
} as const satisfies Record<MediaKind, typeof FileIcon>;

interface FilePreviewProps {
  children?: ReactNode;
  filename: string | null | undefined;
  contentType: string | null | undefined;
  byteSize?: number | null;
  downloadUrl?: string | null;
  trackDownloadUrl?: string | null;
  showDownload?: boolean;
  status?: string;
  onDownload?: () => Promise<boolean>;
}

export function FilePreview({
  children,
  filename,
  contentType,
  byteSize,
  downloadUrl,
  trackDownloadUrl,
  showDownload = true,
  status,
  onDownload,
}: FilePreviewProps) {
  const name = displayFilename(filename);
  const kind = mediaKind(contentType, filename);
  const Icon = kindIcons[kind];
  const url = downloadUrl ? resolveAssetUrl(downloadUrl) : null;
  const trackedUrl = trackDownloadUrl ? resolveAssetUrl(trackDownloadUrl) : url;
  const sizeLabel = formatBytes(byteSize);
  const notReadyLabel = status === "pending" ? "Uploading…" : "Not ready";
  const detail = url || onDownload ? sizeLabel : notReadyLabel;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Icon aria-hidden="true" className="size-8 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-medium">{name}</p>
          {detail === "" ? null : (
            <p className="text-muted-foreground text-xs">{detail}</p>
          )}
        </div>
        {showDownload && (trackedUrl || onDownload) ? (
          <DownloadFileButton
            filename={name}
            url={trackedUrl}
            onDownload={onDownload}
          />
        ) : null}
      </div>
      {children}
    </div>
  );
}

const DOWNLOAD_ITEMS: ActionSwapItem[] = [
  {
    id: "download",
    label: "Download",
    icon: <Download className="size-4" />,
    ariaLabel: "Download",
  },
  {
    id: "downloading",
    label: "Downloading…",
    icon: <Download className="size-4" />,
    ariaLabel: "Downloading",
  },
  {
    id: "downloaded",
    label: "Downloaded",
    icon: <Check className="size-4" />,
    ariaLabel: "Downloaded",
  },
];

export function startFileDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = savingDownloadUrl(url);
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

function DownloadFileButton({
  url,
  filename,
  onDownload,
}: {
  url?: string | null;
  filename: string;
  onDownload?: () => Promise<boolean>;
}) {
  const [value, setValue] = useState("download");
  const [busy, setBusy] = useState(false);
  const timeoutRef = useRef(0);

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <ActionSwapCascadeButton
      className="shrink-0"
      cycle={false}
      items={DOWNLOAD_ITEMS}
      size="sm"
      value={value}
      variant="outline"
      disabled={busy}
      onClick={async () => {
        if (busy) {
          return;
        }
        setBusy(true);
        setValue("downloading");
        const downloaded = onDownload
          ? await onDownload()
          : Boolean(url && startFileDownload(url, filename) === undefined);
        setBusy(false);
        setValue(downloaded ? "downloaded" : "download");
        if (!downloaded) {
          return;
        }
        clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
          setValue("download");
        }, 2000);
      }}
    />
  );
}
