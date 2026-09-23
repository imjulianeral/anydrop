import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExpiryCountdown } from "./expiry-countdown.tsx";

describe("expired countdown", () => {
  it("shows Expired and a visible red ring when a count limit is reached before the deadline", () => {
    const markup = renderToStaticMarkup(
      <ExpiryCountdown
        createdAt="2099-09-20T12:00:00Z"
        expiresAt="2099-09-20T18:00:00Z"
        expired
      />
    );
    expect(markup).toContain("Expired");
    expect(markup).not.toContain("Deletes in");
    expect(markup).toContain('<circle class="stroke-red-500"');
    expect(markup).not.toContain("<time");
  });

  it("also keeps the red ring visible after time expiration", () => {
    const markup = renderToStaticMarkup(
      <ExpiryCountdown
        createdAt="2000-09-20T12:00:00Z"
        expiresAt="2000-09-20T18:00:00Z"
      />
    );
    expect(markup).toContain("Expired");
    expect(markup).toContain('<circle class="stroke-red-500"');
  });
});
