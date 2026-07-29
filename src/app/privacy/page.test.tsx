import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import PrivacyPage from './page'

describe('PrivacyPage', () => {
  it('renders the policy heading', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { name: /privacy policy/i, level: 1 })).toBeInTheDocument()
  })

  it('discloses Google as a third-party ad vendor', () => {
    render(<PrivacyPage />)
    // getAllByText, not getByText: both phrases appear in more than one bullet,
    // and an ancestor <li> matches alongside the text node itself.
    expect(screen.getAllByText(/third-party vendor/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/DoubleClick/i).length).toBeGreaterThan(0)
  })

  it('links to the Google ads opt-out', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('link', { name: /ads settings/i })).toHaveAttribute(
      'href',
      'https://www.google.com/settings/ads',
    )
  })

  it('discloses account data and session cookies', () => {
    render(<PrivacyPage />)
    expect(screen.getAllByText(/session cookie/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Google account/i).length).toBeGreaterThan(0)
  })

  it('covers GDPR, CCPA, and data deletion', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { name: /your rights \(GDPR\)/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /your rights \(CCPA\)/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /data deletion/i })).toBeInTheDocument()
  })

  it('offers a contact address for rights requests', () => {
    render(<PrivacyPage />)
    const contacts = screen.getAllByRole('link', { name: 'hello@crawfordyoung.dev' })
    expect(contacts.length).toBeGreaterThan(0)
    expect(contacts[0]).toHaveAttribute('href', 'mailto:hello@crawfordyoung.dev')
  })

  it('links onward to the terms page', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute(
      'href',
      '/terms',
    )
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<PrivacyPage />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
