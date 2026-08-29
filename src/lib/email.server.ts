import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transactional email, in order of preference:
 *
 * 1. Resend HTTP API — RESEND_API_KEY + EMAIL_FROM ("Hishab <no-reply@yourdomain.com>").
 *    The production path once a sending domain is verified.
 * 2. SMTP — SMTP_USER + SMTP_PASS (defaults to Gmail: an address + app password).
 *    Free, domain-less; fine for beta. SMTP_HOST/SMTP_PORT override the Gmail
 *    defaults, EMAIL_FROM overrides the visible sender.
 * 3. Neither configured: the mail is printed to the server console (dev).
 *
 * `isEmailConfigured` gates the auth flows that must not switch on until
 * delivery actually works (e.g. requiring email verification to sign in).
 */

function resendConfig() {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];
  return apiKey && from ? { apiKey, from } : null;
}

function smtpConfig() {
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!user || !pass) return null;
  return {
    host: process.env["SMTP_HOST"] ?? "smtp.gmail.com",
    port: Number(process.env["SMTP_PORT"] ?? 465),
    user,
    pass,
    from: process.env["EMAIL_FROM"] ?? `Hishab <${user}>`,
  };
}

export function isEmailConfigured(): boolean {
  return Boolean(resendConfig() ?? smtpConfig());
}

let transporter: Transporter | null = null;

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const resend = resendConfig();
  if (resend) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resend.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: resend.from,
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
    return;
  }

  const smtp = smtpConfig();
  if (smtp) {
    transporter ??= nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    await transporter.sendMail({
      from: smtp.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    return;
  }

  // Dev fallback: surface the mail on the server console. Never log message
  // bodies in production — this branch is unreachable there because
  // production requires email to be configured.
  console.info(`[email:dev] to=${options.to} subject=${options.subject}\n${options.text}`);
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
