import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { userKeys } from "@/db/schema";
import { auth } from "@/lib/auth.server";

/**
 * Storage for wrapped key material (see src/lib/crypto.ts). The server treats
 * both blobs as opaque: wrapping and unwrapping happen only in the browser.
 *
 * These skip authMiddleware deliberately: key unlock happens during sign-in,
 * before the 7-day re-verification gate is cleared, and a wrapped blob is
 * useless without the user's password or recovery code.
 */

const WrappedKeySchema = z.object({
  v: z.literal(1),
  kdf: z.literal("PBKDF2-SHA256"),
  iterations: z.number().int().min(100_000).max(10_000_000),
  salt: z.string().min(8).max(200),
  iv: z.string().min(8).max(200),
  ciphertext: z.string().min(8).max(1000),
});

async function requireSession() {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new Response("Unauthorized", { status: 401 });
  return session;
}

/** The caller's wrapped keys, or null when none have been provisioned yet. */
export const getMyKeysFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  const [row] = await db
    .select({
      wrappedDekPassword: userKeys.wrappedDekPassword,
      wrappedDekRecovery: userKeys.wrappedDekRecovery,
    })
    .from(userKeys)
    .where(eq(userKeys.userId, session.user.id))
    .limit(1);
  return row ?? null;
});

/**
 * First-time provisioning. Insert-only: once keys exist they are never
 * silently replaced — a replacement would orphan everything encrypted under
 * the old DEK, so it must go through the explicit re-wrap path instead.
 */
export const createMyKeysFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      wrappedDekPassword: WrappedKeySchema,
      wrappedDekRecovery: WrappedKeySchema,
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const inserted = await db
      .insert(userKeys)
      .values({
        userId: session.user.id,
        wrappedDekPassword: JSON.stringify(data.wrappedDekPassword),
        wrappedDekRecovery: JSON.stringify(data.wrappedDekRecovery),
      })
      .onConflictDoNothing()
      .returning({ userId: userKeys.userId });
    return { created: inserted.length === 1 };
  });

/**
 * Re-wrap after a password change or reset: the DEK itself is unchanged (the
 * client proved it can unwrap it — via the old password or the recovery code)
 * and only the password wrapper is replaced. The recovery wrapper may be
 * replaced in the same call when the user was just issued a new code.
 */
export const rewrapMyKeysFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      wrappedDekPassword: WrappedKeySchema,
      wrappedDekRecovery: WrappedKeySchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const updated = await db
      .update(userKeys)
      .set({
        wrappedDekPassword: JSON.stringify(data.wrappedDekPassword),
        ...(data.wrappedDekRecovery
          ? { wrappedDekRecovery: JSON.stringify(data.wrappedDekRecovery) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(userKeys.userId, session.user.id))
      .returning({ userId: userKeys.userId });
    return { updated: updated.length === 1 };
  });
