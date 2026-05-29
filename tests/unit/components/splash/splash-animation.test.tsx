import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { SplashAnimation } from '@/components/splash/splash-animation'

describe('SplashAnimation', () => {
  it('renders Cy text', () => {
    render(<SplashAnimation checkInDone={false} onComplete={() => {}} />)
    expect(screen.getByText(/Cy/)).toBeInTheDocument()
  })

  it('renders Rein text', () => {
    render(<SplashAnimation checkInDone={true} onComplete={() => {}} />)
    expect(screen.getByText(/Rein/)).toBeInTheDocument()
  })

  it('has loading status role', () => {
    render(<SplashAnimation checkInDone={false} onComplete={() => {}} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('passes axe', async () => {
    const { container } = render(<SplashAnimation checkInDone={true} onComplete={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
