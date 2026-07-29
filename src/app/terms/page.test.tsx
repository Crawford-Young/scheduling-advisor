import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import TermsPage from './page'

describe('TermsPage', () => {
  it('renders the terms heading', () => {
    render(<TermsPage />)
    expect(screen.getByRole('heading', { name: /terms of service/i, level: 1 })).toBeInTheDocument()
  })

  it('covers acceptable use, termination, warranty, and governing law', () => {
    render(<TermsPage />)
    expect(screen.getByRole('heading', { name: /acceptable use/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /termination/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /no warranty/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /governing law/i })).toBeInTheDocument()
  })

  it('links back to the privacy policy', () => {
    render(<TermsPage />)
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('offers a contact address', () => {
    render(<TermsPage />)
    const contacts = screen.getAllByRole('link', { name: 'hello@crawfordyoung.dev' })
    expect(contacts.length).toBeGreaterThan(0)
    expect(contacts[0]).toHaveAttribute('href', 'mailto:hello@crawfordyoung.dev')
  })
})
