import { handlePages, type PagesContext } from "../../server/pagesFn";

export function onRequest(context: PagesContext) {
  return handlePages(context);
}
