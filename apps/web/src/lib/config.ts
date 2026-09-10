export const apiBase =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/u, "") ??
  "";

export const cableUrl = (): string => {
  if (apiBase === "") {
    const protocol = globalThis.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${globalThis.location.host}/cable`;
  }

  return `${apiBase.replace(/^http/u, "ws")}/cable`;
};

// R2's documented 5 TiB object limit excludes 5 GiB.
export const maxFileBytes = 5 * 1024 ** 4 - 5 * 1024 ** 3;
export const maxTextBytes = 64 * 1024;
