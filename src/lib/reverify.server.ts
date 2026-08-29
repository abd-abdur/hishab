import { isEmailConfigured } from "@/lib/email.server";

/** Accounts must re-prove their email this often, at their next sign-in. */
export const REVERIFY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * True when the account's last email proof is older than the interval.
 * Never true while email delivery is unconfigured (local dev) — enforcing
 * would lock everyone out of an app that can't send the code.
 */
export function isVerificationStale(lastVerifiedAt: Date | null | undefined): boolean {
  if (!isEmailConfigured()) return false;
  if (!lastVerifiedAt) return true;
  return Date.now() - lastVerifiedAt.getTime() > REVERIFY_INTERVAL_MS;
}
