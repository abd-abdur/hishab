import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { user, verification } from "@/db/schema";
import { auth } from "@/lib/auth.server";
import { otpEmail, sendEmail } from "@/lib/email.server";
import { isVerificationStale } from "@/lib/reverify.server";

/**
 * Periodic re-verification: when a sign-in is older than the 7-day window,
 * the app emails a 6-digit code and holds the session at /verify-email until
 * the code is entered. These two functions deliberately skip authMiddleware —
 * that middleware rejects stale sessions, and a stale session is exactly who
 * calls them.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const identifierFor = (userId: string) => `reverify:${userId}`;
const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

async function requireSession() {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new Response("Unauthorized", { status: 401 });
  return session;
}

export const requestReverifyCodeFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  const sessionUser = session.user as typeof session.user & { lastVerifiedAt?: Date | null };
  if (!isVerificationStale(sessionUser.lastVerifiedAt)) {
    return { sent: false as const, reason: "not_needed" as const };
  }

  const identifier = identifierFor(session.user.id);
  const [existing] = await db
    .select({ createdAt: verification.createdAt })
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .orderBy(desc(verification.createdAt))
    .limit(1);
  if (existing && Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    // A code just went out; don't let a refresh loop spam the inbox.
    return { sent: true as const, reason: "recent" as const };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.delete(verification).where(eq(verification.identifier, identifier));
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: JSON.stringify({ hash: hashCode(code), attempts: 0 }),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  await sendEmail({ to: session.user.email, ...otpEmail(session.user.name, code) });
  return { sent: true as const, reason: "sent" as const };
});

export const confirmReverifyCodeFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ code: z.string().regex(/^\d{6}$/) }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const identifier = identifierFor(session.user.id);

    const [row] = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, identifier))
      .orderBy(desc(verification.createdAt))
      .limit(1);
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return { ok: false as const, error: "expired" as const };
    }

    const stored = JSON.parse(row.value) as { hash: string; attempts: number };
    if (stored.attempts >= MAX_ATTEMPTS) {
      await db.delete(verification).where(eq(verification.id, row.id));
      return { ok: false as const, error: "expired" as const };
    }

    const given = Buffer.from(hashCode(data.code), "hex");
    const expected = Buffer.from(stored.hash, "hex");
    if (!timingSafeEqual(given, expected)) {
      await db
        .update(verification)
        .set({ value: JSON.stringify({ ...stored, attempts: stored.attempts + 1 }) })
        .where(eq(verification.id, row.id));
      return { ok: false as const, error: "mismatch" as const };
    }

    await db.delete(verification).where(eq(verification.identifier, identifier));
    await db
      .update(user)
      .set({ lastVerifiedAt: new Date(), emailVerified: true, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));
    return { ok: true as const };
  });
