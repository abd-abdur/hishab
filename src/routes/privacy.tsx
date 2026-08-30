import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="30 August 2026">
      <section>
        <h2>The short version</h2>
        <p>
          Hishab reads the bank statements you choose to upload, turns them into transactions, and
          shows you where your money goes. Your financial data is yours: we don't sell it, we don't
          show it to other users, and you can delete it, or your whole account, at any time.
          Statement files themselves are never stored; only the extracted rows are.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account details:</strong> your name, email address, and a hashed password (we
            never store the password itself). If you enable two-factor authentication, an encrypted
            authenticator secret.
          </li>
          <li>
            <strong>Financial data you upload:</strong> transactions extracted from your statements:
            dates, descriptions, merchants, amounts, running balances, and statement metadata such
            as the bank name, statement period, and a masked account number.
          </li>
          <li>
            <strong>Session data:</strong> IP address and browser type for each sign-in, used for
            security.
          </li>
          <li>
            <strong>Usage analytics:</strong> anonymous page-view counts with no cross-site tracking
            and no advertising identifiers. They never identify you.
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
        <h2>How your statements are read</h2>
        <p>
          During upload, the text of your statement passes through a specialist third-party
          transcription service that turns printed rows into structured transactions, with account,
          card, and IBAN numbers already masked before anything leaves your browser. Every
          transcription is then checked by plain arithmetic, reconciled against the balances your
          statement prints, before you review it. Statement text is not kept after processing, and
          every total, chart, and trend you see is computed by ordinary arithmetic on your own data.
          Nothing is estimated, ever.
        </p>
      </section>

      <section>
        <h2>Where your data lives</h2>
        <p>
          Your data resides on professionally managed, enterprise-grade infrastructure and is
          encrypted at rest and in transit. Transactional emails (verification links, sign-in codes,
          password resets) are delivered through a reputable email provider, and their content is
          limited to what the message strictly needs.
        </p>
      </section>

      <section>
        <h2>Your rights and controls</h2>
        <ul>
          <li>Delete any statement; its transactions go with it, immediately.</li>
          <li>
            Delete your account, and everything linked to it (statements, transactions, budgets,
            rules, sessions) is removed at once, not by a background job.
          </li>
          <li>Export your transactions to CSV at any time.</li>
          <li>
            Ask us to access, correct, or erase your personal data, consistent with the UAE Personal
            Data Protection Law (Federal Decree-Law No. 45 of 2021).
          </li>
        </ul>
      </section>

      <section>
        <h2>Encryption: what we can and cannot read</h2>
        <p>
          The identifying content of your transactions (descriptions, merchant names, statement file
          names, bank names, masked account numbers) is{" "}
          <strong>encrypted in your browser before it reaches us</strong>, with a key derived from
          your password that never leaves your device. What we hold for those fields is ciphertext
          we cannot decrypt: not our team, not our infrastructure providers, not anyone with a copy
          of our records.
        </p>
        <p>
          Two things stay readable to the server, deliberately: the numeric skeleton (amounts,
          dates, direction, category, and a coarse country code for the by-country report), which is
          what computes your totals, budgets, and trends, and a scrambled merchant fingerprint that
          lets equal merchants group together without revealing who they are. A technical note in
          the same spirit of candor: the duplicate-detection fingerprint on each row is derived from
          the original text before encryption, so someone holding our records and a large list of
          guessed merchants could in principle test guesses against it. It reveals nothing directly.
        </p>
        <p>
          The flip side of encryption we can't undo:{" "}
          <strong>
            if you lose both your password and your recovery code, your encrypted data is
            unrecoverable by anyone.
          </strong>{" "}
          Save the recovery code Hishab shows you.
        </p>
      </section>

      <section>
        <h2>Security measures</h2>
        <p>
          Passwords are hashed with a modern algorithm and must be at least 12 characters. Optional
          two-factor authentication, sign-in rate limiting, periodic email re-verification, upload
          quotas, and scrubbed server logs (statement content is never logged) are all in place.
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
