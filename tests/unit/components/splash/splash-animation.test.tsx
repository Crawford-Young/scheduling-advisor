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

  it('advances through split → signal → done phases', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const onComplete = vi.fn()
    render(<SplashAnimation checkInDone={false} onComplete={onComplete} quote={mockQuote} />)
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

  it('signal phase with checkInDone true renders glow', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<SplashAnimation checkInDone={true} onComplete={() => {}} quote={mockQuote} />)

    act(() => {
      vi.advanceTimersByTime(400)
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders attribution when provided', () => {
    render(
      <SplashAnimation
        checkInDone={false}
        onComplete={() => {}}
        quote={{ text: 'quote', attribution: 'Author' }}
      />,
    )
    expect(screen.getByText(/Author/)).toBeInTheDocument()
  })

  it('passes axe', async () => {
    const { container } = render(
      <SplashAnimation checkInDone={true} onComplete={() => {}} quote={mockQuote} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
