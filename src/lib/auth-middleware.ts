import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "@/lib/auth.server";

/**
 * Attach to every data server function. Rejects unauthenticated calls and
 * exposes `context.userId` / `context.user` to the handler.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return next({
    context: {
      userId: session.user.id,
      user: session.user,
    },
  });
});

/** Session lookup for route guards (`beforeLoad`). Returns null when signed out. */
export const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
});
