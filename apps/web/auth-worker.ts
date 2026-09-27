interface AuthWorkerEnv {
  API_URL: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  fetch(request: Request, env: AuthWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/auth/")) {
      return env.ASSETS.fetch(request);
    }
    const target = new URL(env.API_URL);
    target.pathname = url.pathname;
    target.search = url.search;
    return fetch(new Request(target, request), { redirect: "manual" });
  },
};
