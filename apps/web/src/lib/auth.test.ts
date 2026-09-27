import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  addPasskey,
  AuthError,
  authRequest,
  isReauthRequired,
  signalAccount,
  signInWithPasskey,
  signUpWithPasskey,
} from "./auth.ts";
import type { AccountUser } from "./auth.ts";

vi.mock(import("@simplewebauthn/browser"), () => ({
  startAuthentication: vi.fn<typeof startAuthentication>(),
  startRegistration: vi.fn<typeof startRegistration>(),
}));
describe("authentication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  test("auth uses the website origin, cookies, and CSRF protection", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await authRequest("logout", "csrf");
    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/logout",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf" },
      })
    );
  });

  test("sends the signed passkey response to the verification endpoint", async () => {
    const proof = { id: "credential", response: { signature: "signed" } };
    vi.mocked(startAuthentication).mockResolvedValue(
      proof as Awaited<ReturnType<typeof startAuthentication>>
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ challenge: "challenge" }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await signInWithPasskey("csrf", "security_key", "anyshare.test");
    expect(startAuthentication).toHaveBeenCalledWith({
      optionsJSON: { challenge: "challenge" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/passkeys/authentication/options",
      expect.objectContaining({
        body: JSON.stringify({ authenticator: "security_key" }),
      })
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/auth/passkeys/authentication",
      expect.objectContaining({ body: JSON.stringify(proof) })
    );
  });

  test("cancelled enrollment never submits a credential", async () => {
    vi.mocked(startRegistration).mockRejectedValue(new Error("Cancelled"));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ challenge: "challenge" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(addPasskey("csrf", "app")).rejects.toThrow("Cancelled");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("passkey sign-up sends the name and chosen authenticator", async () => {
    const credential = { id: "credential", response: {} };
    vi.mocked(startRegistration).mockResolvedValue(
      credential as Awaited<ReturnType<typeof startRegistration>>
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ challenge: "challenge" }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await signUpWithPasskey("csrf", "Ada", "app");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/auth/passkeys/signup/options",
      expect.objectContaining({
        body: JSON.stringify({ name: "Ada", authenticator: "app" }),
      })
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/auth/passkeys/signup",
      expect.objectContaining({ body: JSON.stringify(credential) })
    );
  });

  test("exposes error codes so sensitive changes can step up", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: "Confirm it's you", code: "reauth_required" },
            { status: 403 }
          )
        )
    );
    const error = await authRequest("account", "csrf", undefined, "DELETE")
      .then(() => null)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthError);
    expect(isReauthRequired(error)).toBe(true);
    expect(isReauthRequired(new Error("other"))).toBe(false);
  });

  test("tells the password manager to forget passkeys this site no longer knows", async () => {
    const signalUnknownCredential = vi.fn(() => Promise.resolve());
    vi.stubGlobal("PublicKeyCredential", { signalUnknownCredential });
    vi.mocked(startAuthentication).mockResolvedValue({
      id: "stale",
    } as Awaited<ReturnType<typeof startAuthentication>>);
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ challenge: "challenge" }))
        .mockResolvedValueOnce(
          Response.json(
            { error: "Unknown", code: "unknown_credential" },
            { status: 422 }
          )
        )
    );
    await expect(
      signInWithPasskey("csrf", "app", "anyshare.test")
    ).rejects.toThrow("Unknown");
    expect(signalUnknownCredential).toHaveBeenCalledWith({
      rpId: "anyshare.test",
      credentialId: "stale",
    });
  });

  test("signals the accepted passkeys and current name, ignoring unsupported browsers", async () => {
    const user: AccountUser = {
      id: "user",
      name: "Ada",
      email: null,
      webauthn_id: "dXNlcg",
      google: null,
      passkeys: [
        {
          id: "one",
          name: "iCloud Keychain",
          backed_up: true,
          transports: ["internal"],
          created_at: "2026-09-26T00:00:00Z",
          last_used_at: null,
        },
      ],
      reauth_until: "2026-09-26T00:10:00Z",
    };
    const signalAllAcceptedCredentials = vi.fn(() => Promise.resolve());
    const signalCurrentUserDetails = vi.fn(() =>
      Promise.reject(new Error("Not allowed"))
    );
    vi.stubGlobal("PublicKeyCredential", {
      signalAllAcceptedCredentials,
      signalCurrentUserDetails,
    });
    await signalAccount("anyshare.test", user);
    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith({
      rpId: "anyshare.test",
      userId: "dXNlcg",
      allAcceptedCredentialIds: ["one"],
    });
    expect(signalCurrentUserDetails).toHaveBeenCalledWith({
      rpId: "anyshare.test",
      userId: "dXNlcg",
      name: "Ada",
      displayName: "Ada",
    });
    vi.stubGlobal("PublicKeyCredential", {});
    await expect(signalAccount("anyshare.test", user)).resolves.toBeDefined();
  });

  test("surfaces backend errors and non-JSON proxy failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({ error: "Sign in again" }, { status: 403 })
        )
        .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
    );
    await expect(authRequest("logout", "csrf")).rejects.toThrow(
      "Sign in again"
    );
    await expect(authRequest("session")).rejects.toThrow("Sign-in failed");
  });
});
