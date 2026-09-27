const localOrigins = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000",
]);

const websiteOrigin =
  /^https:\/\/anyshare-website(?:-[\w-]+)?\.[\w.-]+\.workers\.dev$/u;

const allowOrigin = (origin = "") =>
  localOrigins.has(origin) || websiteOrigin.test(origin)
    ? origin
    : "http://localhost:3000";

export const corsHeaders = (
  origin: string | undefined,
  requestUrl = ""
): Record<string, string> => ({
  "Access-Control-Allow-Origin": allowOrigin(origin),
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Expose-Headers": "Authorization",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  ...(requestUrl.startsWith("https:")
    ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
    : {}),
});
