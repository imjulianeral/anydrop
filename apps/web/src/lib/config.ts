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

export const maxFileBytes = 2 * 1024 * 1024 * 1024;
export const maxTextBytes = 64 * 1024;
