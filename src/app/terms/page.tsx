import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service | Cybond',
  description: 'The terms you agree to when you use cybond.crawfordyoung.dev.',
}

const EFFECTIVE_DATE = 'July 28, 2026'
const CONTACT_EMAIL = 'hello@crawfordyoung.dev'

const LINK_CLASS = 'text-foreground underline underline-offset-4'

function ContactLink(): React.JSX.Element {
  return (
    <Link href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASS}>
      {CONTACT_EMAIL}
    </Link>
  )
}

export default function TermsPage(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-muted-foreground text-sm underline underline-offset-4">
        Back to Cybond
      </Link>

      <h1 className="mt-8 text-4xl font-bold tracking-tight">Terms of Service</h1>
      <p className="text-muted-foreground mt-3">Effective {EFFECTIVE_DATE}.</p>

      <div className="text-muted-foreground mt-14 space-y-12 leading-relaxed">
        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Agreement</h2>
          <p>
            Cybond is a personal scheduling product operated by Crawford Young at
            cybond.crawfordyoung.dev. Using it means you accept these terms. If you do not accept
            them, do not use the service.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Your account</h2>
          <p>
            An account is created when you sign in with Google. You are responsible for the Google
            account you sign in with and for the activity that happens under your Cybond account. Do
            not share access to it.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Acceptable use</h2>
          <p>While using Cybond, do not:</p>
          <ul className="mt-3 list-disc space-y-3 pl-5">
            <li>Break any applicable law, or use the service to help someone else break one.</li>
            <li>
              Attempt to access another person&apos;s account, data, or any part of the system you
              have not been granted access to.
            </li>
            <li>
              Probe, scrape, overload, or otherwise interfere with the service or the infrastructure
              it runs on.
            </li>
            <li>
              Upload content you have no right to store, or content that is unlawful or abusive.
            </li>
            <li>
              Resell, sublicense, or automate access to the service outside its intended interface.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Your content</h2>
          <p>
            The activities, events, and conversations you create remain yours. You grant only what
            is needed to operate the service — storing, processing, and displaying that content back
            to you. Handling of it is described in the{' '}
            <Link href="/privacy" className={LINK_CLASS}>
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">AI features</h2>
          <p>
            Cybond includes an assistant that generates scheduling suggestions. Its output can be
            wrong, and it is not professional advice of any kind. Check anything that matters before
            acting on it — you remain responsible for your own schedule and commitments.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Availability and changes</h2>
          <p>
            The service is offered as-is and may change, be interrupted, or be discontinued at any
            time. Features may be added or removed without notice. These terms may also be updated;
            the effective date above reflects the most recent revision.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Termination</h2>
          <p>
            You may stop using Cybond at any time and request deletion of your account and its
            content by emailing <ContactLink />. Access may be suspended or terminated if these
            terms are breached, or if the service is discontinued.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">No warranty</h2>
          <p>
            Cybond is provided without warranties of any kind, express or implied, including
            merchantability, fitness for a particular purpose, and non-infringement. It is not
            guaranteed to be uninterrupted, error-free, or to preserve your data. Keep your own
            copies of anything you cannot afford to lose.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, the operator is not liable for any indirect,
            incidental, or consequential damages, or for lost data, profits, or missed commitments
            arising from your use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Governing law</h2>
          <p>
            These terms are governed by the laws of the State of New York, United States, without
            regard to its conflict-of-law rules.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Contact</h2>
          <p>
            Questions about these terms: <ContactLink />.
          </p>
        </section>
      </div>
    </main>
  )
}
