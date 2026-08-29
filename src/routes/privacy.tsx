import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="29 August 2026">
      <section>
        <h2>The short version</h2>
        <p>
          Hishab reads the bank statements you choose to upload, turns them into transactions, and
          shows you where your money goes. Your financial data is yours: we don't sell it, we
          don't show it to other users, and you can delete it — or your whole account — at any
          time. Statement files themselves are never stored; only the extracted rows are.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account details</strong> — your name, email address, and a hashed password
            (we never store the password itself). If you enable two-factor authentication, an
            encrypted authenticator secret.
          </li>
          <li>
            <strong>Financial data you upload</strong> — transactions extracted from your
            statements: dates, descriptions, merchants, amounts, running balances, and statement
            metadata such as the bank name, statement period, and a masked account number.
          </li>
          <li>
            <strong>Session data</strong> — IP address and browser type for each sign-in, used
            for security.
          </li>
          <li>
            <strong>Usage analytics</strong> — anonymous page-view analytics (Vercel Analytics)
            with no cross-site tracking and no advertising identifiers.
          </li>
        </ul>
      </section>

      <section>
        <h2>What we deliberately don't keep</h2>
        <ul>
          <li>
            <strong>Your statement files.</strong> PDFs and spreadsheets are processed in memory
            during upload and are not saved.
          </li>
          <li>
            <strong>Full account, card, or IBAN numbers.</strong> These are masked to their last
            four digits before any processing beyond your browser, and only the masked form is
            stored.
          </li>
        </ul>
      </section>

      <section>
        <h2>How AI is involved</h2>
        <p>
          During upload, the text of your statement is sent to a third-party AI service to
          transcribe transaction rows — with account, card, and IBAN numbers already masked. The
          AI's output is checked by deterministic arithmetic (reconciliation against your
          statement's balances) before you review it. Statement text is not stored by us after
          processing. All totals, charts, and analytics are computed by ordinary arithmetic on
          your data, not by AI.
        </p>
      </section>

      <section>
        <h2>Where your data lives</h2>
        <p>
          Data is stored in a managed Postgres database (Neon) hosted in the AWS Singapore
          region, encrypted at rest and in transit. The application runs on Vercel. Transactional
          emails (verification links, sign-in codes, password resets) are delivered through our
          email provider; email content is limited to what the message needs.
        </p>
      </section>

      <section>
        <h2>Your rights and controls</h2>
        <ul>
          <li>Delete any statement — its transactions go with it, immediately.</li>
          <li>
            Delete your account — everything linked to it (statements, transactions, budgets,
            rules, sessions) is removed by the database itself, not a background job.
          </li>
          <li>Export your transactions to CSV at any time.</li>
          <li>
            Ask us to access, correct, or erase your personal data, consistent with the UAE
            Personal Data Protection Law (Federal Decree-Law No. 45 of 2021).
          </li>
        </ul>
      </section>

      <section>
        <h2>Security measures</h2>
        <p>
          Passwords are hashed with a modern algorithm and must be at least 12 characters.
          Optional two-factor authentication, sign-in rate limiting, periodic email
          re-verification, upload quotas, and scrubbed server logs (statement content is never
          logged) are all in place. We are building client-side encryption so that stored
          financial data becomes unreadable to anyone but you — including us; this policy will be
          updated when it ships.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If this policy changes in a way that matters, we'll say so in the app before the change
          takes effect. The date at the top always reflects the current version.
        </p>
      </section>
    </LegalPage>
  );
}
