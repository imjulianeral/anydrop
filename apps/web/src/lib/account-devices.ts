import type { DeviceClaim, Peer } from "#/lib/api.ts";
import { authRequest } from "#/lib/auth.ts";

/**
 * How the signed-in account relates to this browser's device: saved to it,
 * not saved to anyone yet, or saved to someone else (a friend's device).
 */
export type CurrentDeviceStatus = "mine" | "unsaved" | "other_account";

export interface SavedDevice extends Peer {
  relation: "mine";
  online: boolean;
  saved_at: string | null;
}

export interface AccountDevices {
  devices: SavedDevice[];
  /** Requests this account sent that the target device hasn't answered. */
  claims: DeviceClaim[];
  current: { id: string; status: CurrentDeviceStatus } | null;
}

// Account routes prove the person with the cookie and the device with this header.
const device = (token: string) => ({ "X-Device-Token": token });

export const listAccountDevices = (deviceToken: string) =>
  authRequest<AccountDevices>(
    "devices",
    undefined,
    undefined,
    "GET",
    device(deviceToken)
  );

export const saveCurrentDevice = (
  csrfToken: string,
  deviceToken: string,
  name?: string
) =>
  authRequest<{ device: SavedDevice }>(
    "devices/current",
    csrfToken,
    { name },
    "POST",
    device(deviceToken)
  );

export const requestDeviceClaim = (
  csrfToken: string,
  deviceToken: string,
  deviceId: string,
  name: string
) =>
  authRequest<{ claim: DeviceClaim }>(
    "devices/claims",
    csrfToken,
    { device_id: deviceId, name },
    "POST",
    device(deviceToken)
  );

export const cancelDeviceClaim = (csrfToken: string, id: string) =>
  authRequest<{ claim: DeviceClaim }>(
    `devices/claims/${encodeURIComponent(id)}`,
    csrfToken,
    undefined,
    "DELETE"
  );

export const renameSavedDevice = (
  csrfToken: string,
  id: string,
  name: string
) =>
  authRequest<{ device: SavedDevice }>(
    `devices/${encodeURIComponent(id)}`,
    csrfToken,
    { name },
    "PATCH"
  );

export const removeSavedDevice = (csrfToken: string, id: string) =>
  authRequest(
    `devices/${encodeURIComponent(id)}`,
    csrfToken,
    undefined,
    "DELETE"
  );

/** Requests still waiting for an answer. */
export const pendingClaims = (claims: DeviceClaim[], now = Date.now()) =>
  claims.filter(
    (claim) => claim.status === "pending" && Date.parse(claim.expires_at) > now
  );

/** Applies a realtime update, dropping requests that are no longer pending. */
export const mergeClaim = (claims: DeviceClaim[], claim: DeviceClaim) =>
  pendingClaims([...claims.filter((item) => item.id !== claim.id), claim]);

/** A nearby device nobody has saved yet: one this account can ask to save. */
export const isClaimable = (peer: Peer) =>
  peer.relation === "nearby" && !peer.saved;

export const claimablePeers = (peers: Peer[]) => peers.filter(isClaimable);

export const MAX_DEVICE_NAME_LENGTH = 40;
