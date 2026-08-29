import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="29 August 2026">
      <section>
        <h2>What Hishab is</h2>
        <p>
          Hishab is a personal spending tracker: you upload your own bank or card statements, and
          it extracts, categorizes, and charts the transactions so you can understand your
          spending. It is currently offered as a beta service.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>You must sign up with an email address you control and keep it verified.</li>
          <li>
            You are responsible for keeping your password (and recovery codes, if you enable
            two-factor authentication) safe. We recommend enabling two-factor authentication for
            any account holding real financial data.
          </li>
          <li>One person per account; don't share credentials.</li>
        </ul>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>
            Upload only statements you are entitled to: your own, or ones you have clear
            permission to analyze.
          </li>
          <li>
            Don't probe, overload, or abuse the service — upload quotas and rate limits exist and
            are enforced.
          </li>
          <li>Don't attempt to access other users' data. Every request is scoped to your account.</li>
        </ul>
      </section>

      <section>
        <h2>Accuracy — read this one</h2>
        <p>
          Statement extraction uses AI transcription checked by arithmetic reconciliation, and
          every upload shows you the rows for review before anything is saved. It can still make
          mistakes — a misread scan, an ambiguous date format, a merchant guessed wrong. Hishab
          shows a reconciliation status for each statement precisely so you can spot this.
          <strong> Verify against your bank before acting on the numbers.</strong> Hishab is not
          financial, tax, or investment advice.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          Your financial data remains yours. You grant us only the license needed to process it
          for you — extraction, categorization, analytics, display — and nothing else. We don't
          sell it or use it to build products for anyone else. Delete it whenever you want.
        </p>
      </section>

      <section>
        <h2>Service availability</h2>
        <p>
          Hishab is provided "as is", without warranty. As a beta service it may change, break,
          or pause without notice, and our liability is limited to the fullest extent permitted
          by law. We'll treat your data with care regardless — see the{" "}
          <a href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </a>{" "}
          for the specifics.
        </p>
      </section>

      <section>
        <h2>Termination</h2>
        <p>
          You can stop using Hishab and delete your account at any time. We may suspend accounts
          that violate these terms — abuse of the service or attempts to access others' data
          being the clear cases.
        </p>
      </section>

      <section>
        <h2>Governing law</h2>
        <p>These terms are governed by the laws of the United Arab Emirates.</p>
      </section>
    </LegalPage>
  );
}
