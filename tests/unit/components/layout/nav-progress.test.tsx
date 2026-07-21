import { act, render, screen } from '@testing-library/react'
import { useLinkStatus } from 'next/link'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkPendingReporter, NavProgressProvider } from '@/components/layout/nav-progress'

vi.mock('next/link', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useLinkStatus: vi.fn(),
}))

vi.mock('@/lib/ui', () => ({
  ProgressLine: ({
    active,
    label,
  }: {
    readonly active: boolean
    readonly className?: string
    readonly label?: string
  }) => <div data-testid="progress-line" data-active={active} data-label={label} />,
}))

const mockUseLinkStatus = vi.mocked(useLinkStatus)

function progressLine(): HTMLElement {
  return screen.getByTestId('progress-line')
}

describe('NavProgressProvider / LinkPendingReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders ProgressLine inactive by default', () => {
    render(
      <NavProgressProvider>
        <div>child</div>
      </NavProgressProvider>,
    )
    expect(progressLine()).toHaveAttribute('data-active', 'false')
    expect(progressLine()).toHaveAttribute('data-label', 'Navigating')
  })

  it('activates ProgressLine only after the 150ms threshold when pending', () => {
    mockUseLinkStatus.mockReturnValue({ pending: true })
    render(
      <NavProgressProvider>
        <LinkPendingReporter />
      </NavProgressProvider>,
    )
    expect(progressLine()).toHaveAttribute('data-active', 'false')

    act(() => {
      vi.advanceTimersByTime(149)
    })
    expect(progressLine()).toHaveAttribute('data-active', 'false')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(progressLine()).toHaveAttribute('data-active', 'true')
  })

  it('never activates if pending flips false before the 150ms threshold', () => {
    mockUseLinkStatus.mockReturnValue({ pending: true })
    const { rerender } = render(
      <NavProgressProvider>
        <LinkPendingReporter />
      </NavProgressProvider>,
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(progressLine()).toHaveAttribute('data-active', 'false')

    mockUseLinkStatus.mockReturnValue({ pending: false })
    rerender(
      <NavProgressProvider>
        <LinkPendingReporter />
      </NavProgressProvider>,
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(progressLine()).toHaveAttribute('data-active', 'false')
  })

  it('deactivates again once pending resolves after activation (report(-1) on cleanup)', () => {
    mockUseLinkStatus.mockReturnValue({ pending: true })
    const { rerender } = render(
      <NavProgressProvider>
        <LinkPendingReporter />
      </NavProgressProvider>,
    )

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(progressLine()).toHaveAttribute('data-active', 'true')

    mockUseLinkStatus.mockReturnValue({ pending: false })
    rerender(
      <NavProgressProvider>
        <LinkPendingReporter />
      </NavProgressProvider>,
    )
    expect(progressLine()).toHaveAttribute('data-active', 'false')
  })

  it('stays active until both concurrent reporters clear (count semantics)', () => {
    // Both reporters render every pass in lockstep (A then B) — a persistent
    // implementation keyed on call parity survives the extra automatic
    // re-renders that cleanup-triggered `report(-1)` calls schedule, unlike a
    // pre-queued `mockReturnValueOnce` list which those extra passes would
    // silently desynchronize.
    let pendingA = true
    let pendingB = true
    let callCount = 0
    mockUseLinkStatus.mockImplementation(() => {
      const isReporterA = callCount % 2 === 0
      callCount += 1
      return { pending: isReporterA ? pendingA : pendingB }
    })

    const { rerender } = render(
      <NavProgressProvider>
        <LinkPendingReporter />
        <LinkPendingReporter />
      </NavProgressProvider>,
    )

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(progressLine()).toHaveAttribute('data-active', 'true')

    // Reporter A resolves; reporter B is still pending — line stays active.
    pendingA = false
    rerender(
      <NavProgressProvider>
        <LinkPendingReporter />
        <LinkPendingReporter />
      </NavProgressProvider>,
    )
    expect(progressLine()).toHaveAttribute('data-active', 'true')

    // Reporter B resolves too — now both are clear.
    pendingB = false
    rerender(
      <NavProgressProvider>
        <LinkPendingReporter />
        <LinkPendingReporter />
      </NavProgressProvider>,
    )
    expect(progressLine()).toHaveAttribute('data-active', 'false')
  })
})
