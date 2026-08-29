import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;

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
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "That password is too long — 128 characters is the maximum.",
  EMAIL_NOT_VERIFIED: "This email hasn't been verified yet.",
  SESSION_EXPIRED: "Your session expired — please sign in again.",
  VALIDATION_ERROR: "Please check the details you entered and try again.",
};

export type AuthError = { code?: string | undefined; message?: string | undefined };

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
  return error?.message ?? fallback;
}
