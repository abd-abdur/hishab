/**
 * Transactional email via the Resend HTTP API — no SDK dependency.
 *
 * Configured with RESEND_API_KEY and EMAIL_FROM (e.g. "Hishab <no-reply@yourdomain.com>").
 * When RESEND_API_KEY is absent (local dev), emails are not sent; callers decide
 * their own fallback. `isEmailConfigured` lets auth require verification only
 * when we can actually deliver the verification mail.
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"] && process.env["EMAIL_FROM"]);
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];
  if (!apiKey || !from) {
    // Dev fallback: surface the mail on the server console. Never log message
    // bodies in production — this branch is unreachable there because
    // production requires email to be configured.
    console.info(`[email:dev] to=${options.to} subject=${options.subject}\n${options.text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });
  if (!response.ok) {
    // Log status only — the body can echo recipient addresses.
    throw new Error(`Email send failed with status ${response.status}`);
  }
}

export function verificationEmail(name: string, url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Verify your email for Hishab";
  const text = `Hi ${name},\n\nConfirm this email address to finish setting up your Hishab account:\n\n${url}\n\nIf you didn't create a Hishab account, you can ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #2b2a26;">
      <h2 style="font-weight: 600;">Verify your email</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Confirm this email address to finish setting up your Hishab account.</p>
      <p style="margin: 28px 0;">
        <a href="${url}" style="background: #1d5c47; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; display: inline-block;">Verify email</a>
      </p>
      <p style="color: #6b6a64; font-size: 13px;">If you didn't create a Hishab account, you can ignore this email.</p>
    </div>`;
  return { subject, html, text };
}

export function resetPasswordEmail(name: string, url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Reset your Hishab password";
  const text = `Hi ${name},\n\nSomeone asked to reset the password for this Hishab account. If that was you, open this link to choose a new password:\n\n${url}\n\nThe link expires in 1 hour. If you didn't ask for this, ignore this email — your password is unchanged.`;
  const html = `
    <div style="font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #2b2a26;">
      <h2 style="font-weight: 600;">Reset your password</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Someone asked to reset the password for this Hishab account. If that was you, choose a new password below.</p>
      <p style="margin: 28px 0;">
        <a href="${url}" style="background: #1d5c47; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; display: inline-block;">Choose a new password</a>
      </p>
      <p style="color: #6b6a64; font-size: 13px;">The link expires in 1 hour. If you didn't ask for this, ignore this email — your password is unchanged.</p>
    </div>`;
  return { subject, html, text };
}

export function otpEmail(name: string, otp: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `${otp} is your Hishab sign-in code`;
  const text = `Hi ${name},\n\nYour Hishab sign-in code is:\n\n${otp}\n\nIt expires shortly. If you weren't signing in, change your password.`;
  const html = `
    <div style="font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #2b2a26;">
      <h2 style="font-weight: 600;">Your sign-in code</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p style="font-size: 28px; font-weight: 600; letter-spacing: 6px; margin: 24px 0;">${escapeHtml(otp)}</p>
      <p style="color: #6b6a64; font-size: 13px;">It expires shortly. If you weren't signing in, change your password.</p>
    </div>`;
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
