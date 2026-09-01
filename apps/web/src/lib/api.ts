import { apiBase } from "#/lib/config.ts";
import type { DeviceKind } from "#/lib/device.ts";

export interface Peer {
  id: string;
  display_name: string;
  device_kind: DeviceKind;
  room_code: string | null;
  last_seen_at: string;
}

export interface Transfer {
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

export interface UploadTarget {
  url: string;
  headers: Record<string, string>;
}

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
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
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

export const createSession = (input: {
  id: string;
  displayName: string;
  deviceKind: DeviceKind;
}) =>
  request<{ token: string; device: Peer; peers: Peer[] }>("/api/v1/sessions", {
    method: "POST",
    body: {
      id: input.id,
      display_name: input.displayName,
      device_kind: input.deviceKind,
    },
  });

export const updateDevice = (
  token: string,
  input: { displayName?: string; roomCode?: string | null }
) =>
  request<{ device: Peer; peers: Peer[] }>("/api/v1/device", {
    method: "PATCH",
    token,
    body: {
      display_name: input.displayName,
      room_code: input.roomCode,
    },
  });

export const listPeers = (token: string) =>
  request<{ peers: Peer[] }>("/api/v1/peers", { token });

export interface ShortLink {
  code: string;
  kind: "url" | "text" | "file";
  url?: string;
  body?: string;
  filename?: string | null;
  byte_size?: number | null;
  content_type?: string | null;
  download?: { url: string };
  expires_at: string;
}

export const shortPageUrl = (code: string) =>
  `${globalThis.location.origin}/s/${code}`;

export const createTextTransfer = (
  token: string,
  input: { recipientId?: string; body: string }
) =>
  request<{ transfer: Transfer; short_link: ShortLink }>("/api/v1/transfers", {
    method: "POST",
    token,
    body: {
      recipient_id: input.recipientId,
      kind: "text",
      body: input.body,
    },
  });

export const createFileTransfer = (
  token: string,
  input: {
    recipientId?: string;
    filename: string;
    byteSize: number;
    contentType: string;
  }
) =>
  request<{ transfer: Transfer; upload: UploadTarget }>("/api/v1/transfers", {
    method: "POST",
    token,
    body: {
      recipient_id: input.recipientId,
      kind: "file",
      filename: input.filename,
      byte_size: input.byteSize,
      content_type: input.contentType,
    },
  });

export const completeTransfer = (token: string, id: string) =>
  request<{ transfer: Transfer; short_link: ShortLink }>(
    `/api/v1/transfers/${id}/complete`,
    {
      method: "POST",
      token,
    }
  );

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

export const createShortLink = (token: string, url: string) =>
  request<{ short_link: ShortLink }>("/api/v1/short_links", {
    method: "POST",
    token,
    body: { url },
  });

export const listShortLinks = (token: string) =>
  request<{ short_links: ShortLink[] }>("/api/v1/short_links", { token });

export const getShortLink = (code: string) =>
  request<{ short_link: ShortLink }>(
    `/api/v1/short_links/${encodeURIComponent(code)}`
  );

export const resolveAssetUrl = (url: string): string => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${apiBase}${url}`;
};
