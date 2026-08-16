import os from "node:os";

export const lanIPv4 = (): string | undefined => {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      const family = address.family;
      if ((family === "IPv4" || family === 4) && !address.internal) {
        return address.address;
      }
    }
  }
};

export const isLoopbackHost = (hostname: string): boolean =>
  hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
