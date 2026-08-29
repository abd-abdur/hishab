import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import {
  isEmailConfigured,
  otpEmail,
  resetPasswordEmail,
  sendEmail,
  verificationEmail,
} from "@/lib/email.server";

function createAuth() {
  const googleClientId = process.env["GOOGLE_CLIENT_ID"];
  const googleClientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  const baseUrl = process.env["BETTER_AUTH_URL"];
  const vercelUrl = process.env["VERCEL_URL"];
  return betterAuth({
    appName: "Hishab",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.rateLimit,
      },
    }),
    trustedOrigins: [...(baseUrl ? [baseUrl] : []), ...(vercelUrl ? [`https://${vercelUrl}`] : [])],
    emailAndPassword: {
      enabled: true,
      // The password will eventually protect the client-side encryption key,
      // so it matters twice.
      minPasswordLength: 12,
      // Only enforced when we can actually deliver the verification mail;
      // local dev without RESEND_API_KEY stays sign-up-and-go.
      requireEmailVerification: isEmailConfigured(),
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        const mail = resetPasswordEmail(user.name, url);
        await sendEmail({ to: user.email, ...mail });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const mail = verificationEmail(user.name, url);
        await sendEmail({ to: user.email, ...mail });
      },
    },
    rateLimit: {
      // Database-backed so limits hold across serverless instances. better-auth
      // applies stricter built-in rules to sensitive paths (sign-in, sign-up)
      // on top of this window.
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
    },
    session: {
      // sessions expire after 30 minutes without activity; any authenticated
      // request inside that window extends them
      expiresIn: 60 * 30,
      updateAge: 60,
    },
    ...(googleClientId && googleClientSecret
      ? {
          socialProviders: {
            google: { clientId: googleClientId, clientSecret: googleClientSecret },
          },
        }
      : {}),
    plugins: [
      twoFactor({
        // A verified device stays trusted for 2 weeks before the code is
        // asked for again.
        trustDeviceMaxAge: 60 * 60 * 24 * 14,
        otpOptions: {
          // Email fallback for people without their authenticator at hand.
          sendOTP: async ({ user, otp }) => {
            const mail = otpEmail(user.name, otp);
            await sendEmail({ to: user.email, ...mail });
          },
        },
      }),
      tanstackStartCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | null = null;

function getAuth(): Auth {
  if (!instance) {
    instance = createAuth();
  }
  return instance;
}

/** Lazy proxy: better-auth (and its DB adapter) initialize on first use. */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const real = getAuth() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});
