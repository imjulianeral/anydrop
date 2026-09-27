import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

export interface AccountPasskey {
  id: string;
  name: string;
  backed_up: boolean;
  transports: string[];
  created_at: string;
  last_used_at: string | null;
}

export interface AccountUser {
  id: string;
  name: string;
  email: string | null;
  /** The base64url WebAuthn user handle, used for the Signal API. */
  webauthn_id: string;
  google: { email: string | null } | null;
  passkeys: AccountPasskey[];
  /** Sensitive changes work without a new verification until this time. */
  reauth_until: string;
}

export interface AccountSession {
  user: AccountUser | null;
  rp_id: string;
  csrf_token: string;
  google_enabled: boolean;
  error: string | null;
  /** `account_not_found` when someone tried to sign in before creating an account. */
  error_code: string | null;
  notice: string | null;
}

/** A passkey kept in an app or on a phone, or a hardware key such as a YubiKey. */
export type PasskeyAuthenticator = "app" | "security_key";

export type GoogleIntent = "sign_in" | "sign_up" | "link" | "reauth";

export class AuthError extends Error {
  readonly code: string | null;
  readonly credentialId: string | null;

  constructor(
    message: string,
    code: string | null = null,
    credentialId: string | null = null
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.credentialId = credentialId;
  }
}

export async function authRequest<T>(
  path: string,
  csrfToken?: string,
  body?: unknown,
  method = "POST"
): Promise<T> {
  const response = await fetch(`/auth/${path}`, {
    method: csrfToken ? method : "GET",
    credentials: "same-origin",
    headers: csrfToken
      ? { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }
      : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new AuthError(
      error?.error ?? "Sign-in failed. Please try again.",
      error?.code ?? null,
      error?.credential_id ?? null
    );
  }
  return response.json();
}

export const isReauthRequired = (error: unknown): boolean =>
  error instanceof AuthError && error.code === "reauth_required";

/** Sign-in found no account for this passkey: the person should create one. */
export const isAccountNotFound = (error: unknown): boolean =>
  error instanceof AuthError && error.code === "unknown_credential";

export const getAccountSession = () => authRequest<AccountSession>("session");

export async function startGoogle(
  csrfToken: string,
  intent: GoogleIntent = "sign_in"
): Promise<void> {
  const { url } = await authRequest<{ url: string }>("google", csrfToken, {
    intent,
  });
  globalThis.location.assign(url);
}

export async function signUpWithPasskey(
  csrfToken: string,
  name: string,
  authenticator: PasskeyAuthenticator
): Promise<void> {
  const optionsJSON = await authRequest<PublicKeyCredentialCreationOptionsJSON>(
    "passkeys/signup/options",
    csrfToken,
    { name, authenticator }
  );
  const credential = await startRegistration({ optionsJSON });
  await authRequest("passkeys/signup", csrfToken, credential);
}

export async function signInWithPasskey(
  csrfToken: string,
  authenticator: PasskeyAuthenticator,
  rpId: string
): Promise<void> {
  const optionsJSON = await authRequest<PublicKeyCredentialRequestOptionsJSON>(
    "passkeys/authentication/options",
    csrfToken,
    { authenticator }
  );
  const credential = await startAuthentication({ optionsJSON });
  try {
    await authRequest("passkeys/authentication", csrfToken, credential);
  } catch (error) {
    if (error instanceof AuthError && error.code === "unknown_credential") {
      await signalUnknownCredential(rpId, credential.id);
    }
    throw error;
  }
}

/** Confirms the signed-in person with one of their own passkeys (step-up). */
export async function reauthenticateWithPasskey(
  csrfToken: string
): Promise<void> {
  const optionsJSON = await authRequest<PublicKeyCredentialRequestOptionsJSON>(
    "passkeys/reauthentication/options",
    csrfToken
  );
  const credential = await startAuthentication({ optionsJSON });
  await authRequest("passkeys/reauthentication", csrfToken, credential);
}

export async function addPasskey(
  csrfToken: string,
  authenticator: PasskeyAuthenticator
): Promise<void> {
  const optionsJSON = await authRequest<PublicKeyCredentialCreationOptionsJSON>(
    "passkeys/registration/options",
    csrfToken,
    { authenticator }
  );
  const credential = await startRegistration({ optionsJSON });
  await authRequest("passkeys/registration", csrfToken, credential);
}

export const renamePasskey = (csrfToken: string, id: string, name: string) =>
  authRequest(
    `passkeys/${encodeURIComponent(id)}`,
    csrfToken,
    { name },
    "PATCH"
  );

export const removePasskey = (csrfToken: string, id: string) =>
  authRequest(
    `passkeys/${encodeURIComponent(id)}`,
    csrfToken,
    undefined,
    "DELETE"
  );

export const unlinkGoogle = (csrfToken: string) =>
  authRequest("google", csrfToken, undefined, "DELETE");

export const updateProfile = (csrfToken: string, name: string) =>
  authRequest("profile", csrfToken, { name }, "PATCH");

export const deleteAccount = (csrfToken: string) =>
  authRequest("account", csrfToken, undefined, "DELETE");

export const logout = (csrfToken: string) => authRequest("logout", csrfToken);

// WebAuthn Signal API: keeps password managers in sync with this site so people
// never have to clean up stale passkeys themselves. Unsupported browsers skip it.

interface SignalApi {
  signalUnknownCredential?: (options: {
    rpId: string;
    credentialId: string;
  }) => Promise<void>;
  signalAllAcceptedCredentials?: (options: {
    rpId: string;
    userId: string;
    allAcceptedCredentialIds: string[];
  }) => Promise<void>;
  signalCurrentUserDetails?: (options: {
    rpId: string;
    userId: string;
    name: string;
    displayName: string;
  }) => Promise<void>;
}

const signalApi = (): SignalApi | null =>
  typeof PublicKeyCredential === "undefined"
    ? null
    : (PublicKeyCredential as unknown as SignalApi);

async function signal(send: (api: SignalApi) => Promise<void> | undefined) {
  const api = signalApi();
  if (!api) {
    return;
  }
  try {
    await send(api);
  } catch {
    // Signals are best-effort hints to the password manager.
  }
}

export const signalUnknownCredential = (rpId: string, credentialId: string) =>
  signal((api) => api.signalUnknownCredential?.({ rpId, credentialId }));

/** Tells the password manager which passkeys still work, and the current name. */
export const signalAccount = (rpId: string, user: AccountUser) =>
  Promise.all([
    signal((api) =>
      api.signalAllAcceptedCredentials?.({
        rpId,
        userId: user.webauthn_id,
        allAcceptedCredentialIds: user.passkeys.map((passkey) => passkey.id),
      })
    ),
    signal((api) =>
      api.signalCurrentUserDetails?.({
        rpId,
        userId: user.webauthn_id,
        name: user.email ?? user.name,
        displayName: user.name,
      })
    ),
  ]);
