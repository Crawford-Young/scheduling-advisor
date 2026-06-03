import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { SplashAnimation } from '@/components/splash/splash-animation'

describe('SplashAnimation', () => {
  const mockQuote = { text: 'test', attribution: null }

  it('renders Cy text', () => {
    render(<SplashAnimation checkInDone={false} onComplete={() => {}} quote={mockQuote} />)
    expect(screen.getByText(/Cy/)).toBeInTheDocument()
  })

  it('renders bond text', () => {
    render(<SplashAnimation checkInDone={true} onComplete={() => {}} quote={mockQuote} />)
    expect(screen.getByText(/bond/)).toBeInTheDocument()
  })

  it('has loading status role', () => {
    render(<SplashAnimation checkInDone={false} onComplete={() => {}} quote={mockQuote} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('passes axe', async () => {
    const { container } = render(
      <SplashAnimation checkInDone={true} onComplete={() => {}} quote={mockQuote} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
