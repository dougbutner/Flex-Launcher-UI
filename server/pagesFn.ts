import { dispatch, type RefreshFn } from "./dispatch";

export type PagesContext = {
  request: Request;
  env?: Record<string, unknown>;
};

export function pagesEnv(raw: Record<string, unknown> | undefined): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

export async function handlePages(context: PagesContext, refresh?: RefreshFn): Promise<Response> {
  const fn =
    refresh ??
    (async () => {
      throw new Error("This route does not refresh snapshots.");
    });
  const result = await dispatch(context.request, pagesEnv(context.env), fn);
  if (result.status === 204) return new Response(null, { status: 204 });
  return Response.json(result.body, { status: result.status });
}
