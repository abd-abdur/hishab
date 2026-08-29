import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { clearStoredKeys } from "@/lib/key-store";

export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});

export const { signIn, signUp, useSession, twoFactor } = authClient;

/** Sign out and drop this browser's stored encryption key. */
export const signOut: typeof authClient.signOut = async (...args) => {
  await clearStoredKeys();
  return authClient.signOut(...args);
};

/** Codes returned by the auth API, mapped to messages a person can act on. */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "An account with this email already exists.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists.",
  INVALID_EMAIL: "That doesn't look like a valid email address.",
  INVALID_EMAIL_OR_PASSWORD: "Wrong email or password.",
  INVALID_PASSWORD: "Wrong email or password.",
  USER_NOT_FOUND: "Wrong email or password.",
  USER_EMAIL_NOT_FOUND: "Wrong email or password.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Wrong email or password.",
  PASSWORD_TOO_SHORT: "Password must be at least 12 characters.",
  PASSWORD_TOO_LONG: "That password is too long — 128 characters is the maximum.",
  EMAIL_NOT_VERIFIED: "Check your inbox — you need to verify this email before signing in.",
  INVALID_TWO_FACTOR_AUTHENTICATION: "That code didn't match. Try the current code from your app.",
  INVALID_CODE: "That code didn't match. Try the current code from your app.",
  TOO_MANY_REQUESTS: "Too many attempts. Wait a minute, then try again.",
  SESSION_EXPIRED: "Your session expired — please sign in again.",
  VALIDATION_ERROR: "Please check the details you entered and try again.",
};

export type AuthError = {
  code?: string | undefined;
  message?: string | undefined;
  status?: number | undefined;
};

/** True when the error means the email is already registered. */
export function isExistingAccountError(error: AuthError | null | undefined): boolean {
  return (
    error?.code === "USER_ALREADY_EXISTS" || error?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
  );
}

export function authErrorMessage(error: AuthError | null | undefined, fallback: string): string {
  if (error?.code && AUTH_ERROR_MESSAGES[error.code]) {
    return AUTH_ERROR_MESSAGES[error.code] as string;
  }
  // Rate-limit responses arrive as plain text without a code, so the status
  // is the only reliable signal.
  if (error?.status === 429) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  if (error?.status !== undefined && error.status >= 500) {
    return "Something went wrong on our side. Try again in a moment.";
  }
  return error?.message ?? fallback;
}
