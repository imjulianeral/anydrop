import { afterEach, describe, expect, test, vi } from "vitest";

import worker from "./auth-worker.ts";

describe("authentication", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("proxies auth cookies, CSRF headers, and redirects without following Google", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          Location: "https://accounts.google.com/",
          "Set-Cookie": "session=encrypted; HttpOnly",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://website.example/auth/google", {
      method: "POST",
      headers: {
        Cookie: "session=browser",
        Origin: "https://website.example",
        "X-CSRF-Token": "csrf",
      },
    });
    const response = await worker.fetch(request, {
      API_URL: "https://api.example",
      ASSETS: { fetch: vi.fn<typeof fetch>() },
    });
    const forwarded = fetchMock.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe("https://api.example/auth/google");
    expect(forwarded.headers.get("Cookie")).toBe("session=browser");
    expect(forwarded.headers.get("X-CSRF-Token")).toBe("csrf");
    expect(fetchMock).toHaveBeenCalledWith(expect.any(Request), {
      redirect: "manual",
    });
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
  });

  test("leaves application assets with the website", async () => {
    const assets = vi.fn<typeof fetch>().mockResolvedValue(new Response("app"));
    const response = await worker.fetch(
      new Request("https://website.example/"),
      {
        API_URL: "https://api.example",
        ASSETS: { fetch: assets },
      }
    );
    await expect(response.text()).resolves.toBe("app");
    expect(assets).toHaveBeenCalledOnce();
  });
});
