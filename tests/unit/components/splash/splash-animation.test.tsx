import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { axe } from 'jest-axe'
import { SplashAnimation } from '@/components/splash/splash-animation'

describe('SplashAnimation', () => {
  const mockQuote = { text: 'test', attribution: null }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders Cy text', () => {
    render(<SplashAnimation onComplete={() => {}} quote={mockQuote} />)
    expect(screen.getByText(/Cy/)).toBeInTheDocument()
  })

  it('renders bond text', () => {
    render(<SplashAnimation onComplete={() => {}} quote={mockQuote} />)
    expect(screen.getByText(/bond/)).toBeInTheDocument()
  })

  it('has loading status role', () => {
    render(<SplashAnimation onComplete={() => {}} quote={mockQuote} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('advances through split → signal → done phases', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const onComplete = vi.fn()
    render(<SplashAnimation onComplete={onComplete} quote={mockQuote} />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(800 + 10)
    })
    expect(onComplete).toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders the signal glow on the bond span in the signal phase (unconditional)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<SplashAnimation onComplete={() => {}} quote={mockQuote} />)

    act(() => {
      vi.advanceTimersByTime(400)
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(screen.getByText(/bond/)).toHaveStyle({
      textShadow: '0 0 20px rgba(16, 185, 129, 0.8)',
    })
  })

  it('renders full opacity on the bond span before and during the signal phase', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<SplashAnimation onComplete={() => {}} quote={mockQuote} />)

    expect(screen.getByText(/bond/)).toHaveStyle({ opacity: '1' })

    act(() => {
      vi.advanceTimersByTime(400)
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(screen.getByText(/bond/)).toHaveStyle({ opacity: '1' })
  })

  it('renders attribution when provided', () => {
    render(
      <SplashAnimation onComplete={() => {}} quote={{ text: 'quote', attribution: 'Author' }} />,
    )
    expect(screen.getByText(/Author/)).toBeInTheDocument()
  })

  it('passes axe', async () => {
    const { container } = render(<SplashAnimation onComplete={() => {}} quote={mockQuote} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
