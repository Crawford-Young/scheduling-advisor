import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | Cybond',
  description: 'What cybond.crawfordyoung.dev collects, why, and what you can do about it.',
}

/**
 * Legal boilerplate — deliberately NOT product-voice gated. The source of truth
 * is `docs/web/adsense-approval/content/privacy-policy.md`; this is a
 * transcription of it plus the cybond-specific additions, and the required
 * strings (`third-party vendor`, `DoubleClick`, `Ads Settings`, `session
 * cookie`, `Google account`) are asserted by tests here and in every sibling
 * repo. A future copy pass must not rewrite this into product voice.
 */
const EFFECTIVE_DATE = 'July 28, 2026'
const CONTACT_EMAIL = 'hello@crawfordyoung.dev'
const ADS_SETTINGS_URL = 'https://www.google.com/settings/ads'
const ABOUT_ADS_URL = 'https://www.aboutads.info/choices/'
const GOOGLE_AD_POLICIES_URL = 'https://policies.google.com/technologies/ads'

const LINK_CLASS = 'text-foreground underline underline-offset-4'

function ExternalLink({
  href,
  children,
}: {
  readonly href: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <Link href={href} target="_blank" rel="noreferrer" className={LINK_CLASS}>
      {children}
    </Link>
  )
}

function ContactLink(): React.JSX.Element {
  return (
    <Link href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASS}>
      {CONTACT_EMAIL}
    </Link>
  )
}

export default function PrivacyPage(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-muted-foreground text-sm underline underline-offset-4">
        Back to Cybond
      </Link>

      <h1 className="mt-8 text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground mt-3">Effective {EFFECTIVE_DATE}.</p>

      <div className="text-muted-foreground mt-14 space-y-12 leading-relaxed">
        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">What this policy covers</h2>
          <p>
            This policy applies to cybond.crawfordyoung.dev, operated by Crawford Young. It explains
            what information the site collects, why, and what you can do about it.
          </p>
          <p className="mt-3">
            It does not cover sites this one links to. Once you follow a link away from
            cybond.crawfordyoung.dev, that site&apos;s own policy applies.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Information collected</h2>
          <ul className="mt-3 list-disc space-y-3 pl-5">
            <li>
              <strong className="text-foreground">Account information.</strong> Signing in uses your{' '}
              <strong className="text-foreground">Google account</strong>. Cybond receives only your
              name, email address, and profile image — the <code>openid</code>, <code>email</code>,
              and <code>profile</code> scopes. Calendar access is a separate, optional connection
              you grant explicitly; it is never part of signing in.
            </li>
            <li>
              <strong className="text-foreground">Session cookie.</strong> Signing in sets an
              HTTP-only <strong className="text-foreground">session cookie</strong> so you stay
              logged in. It is not used for advertising or tracking.
            </li>
            <li>
              <strong className="text-foreground">Your content.</strong> Activities, events, and
              chat conversations you create are stored so the product can function. They are visible
              only to you unless you explicitly mark an event public or share your profile.
            </li>
            <li>
              <strong className="text-foreground">Server logs.</strong> The hosting provider
              (Vercel) records standard request data — IP address, user agent, requested path,
              timestamp — for security and reliability. These logs are retained by Vercel under
              their own policy and are not used to build a profile of you.
            </li>
            <li>
              <strong className="text-foreground">Analytics.</strong> Aggregate page-view counts via
              Vercel Analytics and Vercel Speed Insights. These measure traffic and page performance
              in aggregate. They do not use cookies and do not track you across other sites.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Advertising</h2>
          <p>This site may display advertising served by Google.</p>
          <ul className="mt-3 list-disc space-y-3 pl-5">
            <li>Google is a third-party vendor and uses cookies to serve ads on this site.</li>
            <li>
              Google&apos;s use of advertising cookies — including the DoubleClick cookie — enables
              it and its partners to serve ads to you based on your visit to this site and other
              sites on the internet.
            </li>
            <li>
              You may opt out of personalized advertising by visiting{' '}
              <ExternalLink href={ADS_SETTINGS_URL}>Ads Settings</ExternalLink>.
            </li>
            <li>
              Many other third-party vendors&apos; cookies can be disabled at{' '}
              <ExternalLink href={ABOUT_ADS_URL}>www.aboutads.info</ExternalLink>.
            </li>
            <li>
              Third-party vendors&apos; use of cookies on this site is governed by{' '}
              <ExternalLink href={GOOGLE_AD_POLICIES_URL}>
                Google&apos;s advertising policies
              </ExternalLink>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Cookies</h2>
          <p>A cookie is a small file a site stores in your browser.</p>
          <ul className="mt-3 list-disc space-y-3 pl-5">
            <li>
              The sign-in session cookie described above. It is HTTP-only and not readable by
              scripts.
            </li>
            <li>Advertising cookies are set by Google as described above.</li>
            <li>
              <strong className="text-foreground">Preference storage.</strong> Your light/dark theme
              choice is stored locally in your browser. It never leaves your device and is not a
              tracking cookie.
            </li>
          </ul>
          <p className="mt-3">
            You can block or delete cookies through your browser settings. Blocking the session
            cookie will sign you out; blocking advertising cookies simply means you see less
            relevant ads.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Your rights (GDPR)</h2>
          <p>
            If you are in the European Economic Area or the United Kingdom, you have the right to
            access, correct, or erase personal data held about you, to object to or restrict its
            processing, and to data portability.
          </p>
          <p className="mt-3">
            To exercise any of these rights, email <ContactLink />. You also have the right to
            complain to your local data protection authority.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Your rights (CCPA)</h2>
          <p>
            If you are a California resident, you have the right to know what personal information
            is collected and to request its deletion.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">
              Personal information is not sold, and never has been.
            </strong>{' '}
            To make a request, email <ContactLink />.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Data deletion</h2>
          <p>
            Deleting your account removes the content stored against it — your activities, events,
            chat conversations, profile, and preferences — along with the Google tokens held for any
            calendar connection you granted.
          </p>
          <p className="mt-3">
            To request deletion, email <ContactLink /> from the address you signed in with. You can
            also disconnect Google Calendar at any time from the app&apos;s settings without
            deleting your account; that revokes the stored tokens and leaves the rest of your data
            in place.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Contact</h2>
          <p>
            Questions about this policy: <ContactLink />.
          </p>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-xl font-semibold">Changes to this policy</h2>
          <p>
            This policy may be updated as the site changes. The effective date above reflects the
            most recent revision. Material changes will be noted on this page rather than announced
            separately.
          </p>
        </section>
      </div>

      <p className="text-muted-foreground mt-16 text-sm">
        See also the{' '}
        <Link href="/terms" className={LINK_CLASS}>
          Terms of Service
        </Link>
        .
      </p>
    </main>
  )
}
