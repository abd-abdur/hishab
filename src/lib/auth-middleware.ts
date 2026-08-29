import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "@/lib/auth.server";
import { isVerificationStale } from "@/lib/reverify.server";

type SessionUser = { lastVerifiedAt?: Date | null };

/**
 * Attach to every data server function. Rejects unauthenticated calls and
 * sessions whose 7-day email re-verification is overdue (the /verify-email
 * page clears that), and exposes `context.userId` / `context.user`.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }
  if (isVerificationStale((session.user as SessionUser).lastVerifiedAt)) {
    throw new Response("Re-verification required", { status: 403 });
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
    needsReactivation: isVerificationStale((session.user as SessionUser).lastVerifiedAt),
  };
});
