const localOrigins = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000",
]);

const websiteOrigin =
  /^https:\/\/anyshare-website(?:-[\w-]+)?\.[\w.-]+\.workers\.dev$/u;

const extras = (allowedOrigins: string) =>
  allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

export const allowOrigin = (
  origin: string | undefined,
  allowedOrigins = ""
): string => {
  if (origin !== undefined && localOrigins.has(origin)) {
    return origin;
  }
  if (origin !== undefined && extras(allowedOrigins).includes(origin)) {
    return origin;
  }
  if (origin !== undefined && websiteOrigin.test(origin)) {
    return origin;
  }
  return extras(allowedOrigins)[0] ?? "http://localhost:3000";
};

export const corsHeaders = (
  origin: string | undefined,
  allowedOrigins = ""
): Record<string, string> => ({
  "Access-Control-Allow-Origin": allowOrigin(origin, allowedOrigins),
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Expose-Headers": "Authorization",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});
