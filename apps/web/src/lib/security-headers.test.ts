import { describe, expect, it } from "vitest";

import { corsHeaders } from "../../../../infra/cors.ts";

describe("Worker API security headers", () => {
  it("applies matching headers and limits HSTS to HTTPS", () => {
    const http = corsHeaders(
      "http://localhost:3000",
      "",
      "http://localhost:4000/"
    );
    expect(http).toMatchObject({
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "Access-Control-Allow-Origin": "http://localhost:3000",
    });
    expect(http).not.toHaveProperty("Strict-Transport-Security");
    expect(
      corsHeaders(undefined, "", "https://api.example.test/")[
        "Strict-Transport-Security"
      ]
    ).toBe("max-age=31536000; includeSubDomains");
    expect(http).not.toHaveProperty("Cross-Origin-Embedder-Policy");
  });
});
