import { ApiError } from "./api.ts";

export const shortLinkLoadErrorMessage = (caught: unknown): string => {
  if (
    caught instanceof ApiError &&
    (caught.status === 404 || caught.status === 410)
  ) {
    return "This link has expired or is unavailable.";
  }
  if (caught instanceof Error && caught.message !== "") {
    return caught.message;
  }
  return "This link is unavailable.";
};

export const isRouteModuleLoadError = (caught: unknown): boolean => {
  if (!(caught instanceof Error)) {
    return false;
  }
  return /dynamically imported module|Importing a module script failed/i.test(
    caught.message
  );
};
