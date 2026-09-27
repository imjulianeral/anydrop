import { apiBase } from "#/lib/config.ts";
import type { DeviceKind } from "#/lib/device.ts";

import type { ContentSignals } from "./content-signals.ts";
import type { ExpirationOptions } from "./expiration-options.ts";
import { toBase64Url } from "./secret-format.ts";
import type { Secret } from "./secret-format.ts";

export interface Peer {
  public_key: string | null;
  id: string;
  display_name: string;
  device_kind: DeviceKind;
  room_code: string | null;
  last_seen_at: string;
}

export interface Transfer {
  group_id?: string | null;
  secret?: Secret;
  max_downloads?: number | null;
  download_count?: number;
  id: string;
  sender_id: string;
  recipient_id: string | null;
  kind: "file" | "text";
  filename: string | null;
  byte_size: number | null;
  content_type: string | null;
  body?: string;
  status: string;
  expires_at: string;
  created_at: string;
  download?: { url: string };
}

export interface PartTarget {
  url: string;
  headers: Record<string, string>;
}

export interface MultipartTarget {
  type: "multipart";
  part_size: number;
  part_count: number;
}

export type UploadTarget = (PartTarget & { type: "single" }) | MultipartTarget;

export interface UploadedPart {
  part_number: number;
  etag: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const request = async <T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> => {
  const headers = new Headers(options.headers);
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBase}${path}`, {
    method: options.method ?? "GET",
    headers,
    signal: options.signal,
    body:
      options.rawBody ??
      (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Keep the status message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

export const createSession = (input: {
  sessionToken?: string;
  id: string;
  displayName: string;
  deviceKind: DeviceKind;
  public_key?: string;
}) =>
  request<{ token: string; device: Peer; peers: Peer[] }>("/api/v1/sessions", {
    method: "POST",
    token: input.sessionToken,
    body: {
      id: input.id,
      display_name: input.displayName,
      device_kind: input.deviceKind,
      public_key: input.public_key,
    },
  });

export const updateDevice = (
  token: string,
  input: { displayName?: string; roomCode?: string | null; public_key?: string }
) =>
  request<{ device: Peer; peers: Peer[] }>("/api/v1/device", {
    method: "PATCH",
    token,
    body: {
      display_name: input.displayName,
      room_code: input.roomCode,
      public_key: input.public_key,
    },
  });

export const listPeers = (token: string) =>
  request<{ peers: Peer[] }>("/api/v1/peers", {
    token,
    signal: AbortSignal.timeout(15_000),
  });

export interface DeviceInvitation {
  id: string;
  status: "pending" | "accepted" | "declined" | "disconnected";
  sender: Peer;
  recipient: Peer;
  expires_at: string;
}

export const listInvitations = (token: string) =>
  request<{ invitations: DeviceInvitation[] }>("/api/v1/invitations", {
    token,
    signal: AbortSignal.timeout(15_000),
  });

export const sendInvitation = (token: string, target: string) =>
  request<{ invitation: DeviceInvitation }>("/api/v1/invitations", {
    method: "POST",
    token,
    body: { target },
    signal: AbortSignal.timeout(15_000),
  });

export const answerInvitation = (
  token: string,
  id: string,
  action: "accept" | "decline" | "disconnect"
) =>
  request<{ invitation: DeviceInvitation }>(
    `/api/v1/invitations/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      token,
      body: { action },
      signal: AbortSignal.timeout(15_000),
    }
  );

export interface DeviceGroup {
  id: string;
  name: string;
  owner_id: string;
  members: Peer[];
}

export const listGroups = (token: string) =>
  request<{ groups: DeviceGroup[] }>("/api/v1/groups", {
    token,
    signal: AbortSignal.timeout(15_000),
  });

export const saveGroup = (
  token: string,
  input: { name: string; member_ids: string[] },
  id?: string
) =>
  request<{ group: DeviceGroup }>(
    id ? `/api/v1/groups/${encodeURIComponent(id)}` : "/api/v1/groups",
    { method: id ? "PATCH" : "POST", token, body: input }
  );

export const deleteGroup = (token: string, id: string) =>
  request<undefined>(`/api/v1/groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });

export const leaveGroup = (token: string, id: string) =>
  request<undefined>(`/api/v1/groups/${encodeURIComponent(id)}/leave`, {
    method: "POST",
    token,
  });

export const listGroupTransfers = (token: string, id: string) =>
  request<{ transfers: Transfer[] }>(
    `/api/v1/groups/${encodeURIComponent(id)}/transfers`,
    { token }
  );

export interface ShortLink {
  secret?: Secret;
  max_downloads?: number | null;
  code: string;
  kind: "url" | "text" | "file";
  password_protected?: boolean;
  url?: string;
  body?: string;
  filename?: string | null;
  byte_size?: number | null;
  content_type?: string | null;
  download?: { url: string };
  track_download?: string;
  view_count: number;
  download_count: number;
  expires_at: string;
  created_at: string;
}

export interface LinkStat {
  date: string;
  views: number;
  downloads: number;
}

export interface LinkEventOccurrence {
  occurred_at: string;
  kind: "view" | "download";
}

export const shortPageUrl = (code: string, masterKey?: Uint8Array) =>
  `${globalThis.location.origin}/s/${code}${masterKey ? `#${toBase64Url(masterKey)}` : ""}`;

export const createTextTransfer = (
  token: string,
  input: {
    recipientId?: string;
    groupId?: string;
    body: string;
    secret: Secret;
    expiration?: ExpirationOptions;
    password?: string;
  }
) =>
  request<{ transfer: Transfer; short_link?: ShortLink }>("/api/v1/transfers", {
    method: "POST",
    token,
    body: {
      recipient_id: input.recipientId,
      group_id: input.groupId,
      kind: "text",
      body: input.body,
      secret: input.secret,
      expires_in: input.expiration?.expiresIn,
      max_downloads: input.expiration?.maxDownloads,
      password: input.password,
    },
  });

export const createFileTransfer = (
  token: string,
  input: {
    recipientId?: string;
    groupId?: string;
    filename: string;
    byteSize: number;
    contentType: string;
    secret: Secret;
    expiration?: ExpirationOptions;
  }
) =>
  request<{ transfer: Transfer; upload: UploadTarget }>("/api/v1/transfers", {
    method: "POST",
    token,
    body: {
      recipient_id: input.recipientId,
      group_id: input.groupId,
      kind: "file",
      filename: input.filename,
      byte_size: input.byteSize,
      content_type: input.contentType,
      secret: input.secret,
      expires_in: input.expiration?.expiresIn,
      max_downloads: input.expiration?.maxDownloads,
    },
  });

export const completeTransfer = (
  token: string,
  id: string,
  parts?: UploadedPart[],
  signal?: AbortSignal,
  password?: string,
  signals?: ContentSignals
) =>
  request<{ transfer: Transfer; short_link?: ShortLink }>(
    `/api/v1/transfers/${id}/complete`,
    {
      method: "POST",
      token,
      body:
        parts || password || signals ? { parts, password, signals } : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(150_000)])
        : AbortSignal.timeout(150_000),
    }
  );

export const startMultipartUpload = (
  token: string,
  id: string,
  signal: AbortSignal
) =>
  request<MultipartTarget>(`/api/v1/transfers/${id}/multipart`, {
    method: "POST",
    token,
    signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
  });

export const signUploadPart = (
  token: string,
  id: string,
  partNumber: number,
  signal: AbortSignal
) =>
  request<PartTarget>(`/api/v1/transfers/${id}/multipart/parts`, {
    method: "POST",
    token,
    body: { part_number: partNumber },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });

export const abortMultipartUpload = (token: string, id: string) =>
  request<undefined>(`/api/v1/transfers/${id}/multipart`, {
    method: "DELETE",
    token,
    signal: AbortSignal.timeout(90_000),
  });

export const getTransfer = (token: string, id: string) =>
  request<{ transfer: Transfer; download?: { url: string } }>(
    `/api/v1/transfers/${id}`,
    { token }
  );

export const listTransfers = (token: string, peerId: string) =>
  request<{ transfers: Transfer[] }>(
    `/api/v1/transfers?peer_id=${encodeURIComponent(peerId)}`,
    { token }
  );

export const createShortLink = (
  token: string,
  url: string,
  expiration?: ExpirationOptions,
  password?: string
) =>
  request<{ short_link: ShortLink }>("/api/v1/short_links", {
    method: "POST",
    token,
    body: {
      url,
      expires_in: expiration?.expiresIn,
      max_downloads: expiration?.maxDownloads,
      password,
    },
  });

export const unlockShortLink = (code: string, password: string) =>
  request<{ short_link: ShortLink }>(
    `/api/v1/short_links/${encodeURIComponent(code)}/unlock`,
    {
      method: "POST",
      body: { password },
    }
  );

export const listShortLinks = (token: string) =>
  request<{ short_links: ShortLink[]; events: LinkEventOccurrence[] }>(
    "/api/v1/short_links",
    {
      token,
    }
  );

export const deleteShortLink = (token: string, code: string) =>
  request<undefined>(`/api/v1/short_links/${encodeURIComponent(code)}`, {
    method: "DELETE",
    token,
  });

export const getShortLink = (code: string) =>
  request<{ short_link: ShortLink }>(
    `/api/v1/short_links/${encodeURIComponent(code)}`
  );

export const getShortLinkStats = (token: string, code: string) =>
  request<{
    events: LinkEventOccurrence[];
    view_count: number;
    download_count: number;
  }>(`/api/v1/short_links/${encodeURIComponent(code)}/stats`, { token });

export const resolveAssetUrl = (url: string): string => {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }
  return `${apiBase}${url}`;
};

export const savingDownloadUrl = (url: string): string => {
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  const parsed = new URL(url, "https://anydrop.local");
  parsed.searchParams.set("save", "1");
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return parsed.toString();
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};
