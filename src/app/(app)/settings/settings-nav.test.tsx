import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { axe } from 'jest-axe'
import { SettingsNav } from '@/app/(app)/settings/settings-nav'

// happy-dom does no layout, so IntersectionObserver never fires on its own —
// the observer contract is exercised through this mock, whose `trigger` drives
// the callback by hand. Same shape as MockResizeObserver in
// src/components/chat/use-fab-position.test.tsx:63.
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly targets: Element[] = []
  readonly options: IntersectionObserverInit | undefined
  disconnected = false
  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.targets.push(target)
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  trigger(states: readonly (readonly [string, boolean])[]): void {
    const entries = states.map(([id, isIntersecting]) => {
      const target = document.getElementById(id)
      if (!target) throw new Error(`No element with id "${id}" in the test DOM`)
      return { target, isIntersecting } as unknown as IntersectionObserverEntry
    })
    act(() => {
      this.callback(entries, this as unknown as IntersectionObserver)
    })
  }
}

const originalIntersectionObserver = globalThis.IntersectionObserver

function useMockObserver(): void {
  MockIntersectionObserver.instances = []
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver
}

function latestObserver(): MockIntersectionObserver {
  const observer = MockIntersectionObserver.instances.at(-1)
  if (!observer) throw new Error('No IntersectionObserver was constructed')
  return observer
}

// Mirrors the real tree: the nav lives inside AppShell's
// <main className="flex-1 overflow-y-auto">, which is the scroll container the
// observer must use as its root.
function renderNav(): void {
  render(
    <main>
      <SettingsNav />
      <section id="profile">Profile</section>
      <section id="calendar">Calendar</section>
      <section id="integrations">Integrations</section>
    </main>,
  )
}

function activeTabName(): string {
  const active = screen.getAllByRole('link').find((link) => link.getAttribute('aria-current'))
  return active?.textContent ?? 'none'
}

afterEach(() => {
  cleanup()
  globalThis.IntersectionObserver = originalIntersectionObserver
  MockIntersectionObserver.instances = []
  window.location.hash = ''
  vi.clearAllMocks()
})

describe('SettingsNav', () => {
  it('renders one anchor per section pointing at that section id', () => {
    useMockObserver()
    renderNav()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#profile')
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '#calendar')
    expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute(
      'href',
      '#integrations',
    )
  })

  it('marks the first section active before anything scrolls', () => {
    useMockObserver()
    renderNav()
    expect(activeTabName()).toBe('Profile')
  })

  it('observes every section against the scroll container', () => {
    useMockObserver()
    renderNav()
    const observer = latestObserver()
    expect(observer.targets.map((target) => target.id)).toEqual([
      'profile',
      'calendar',
      'integrations',
    ])
    expect(observer.options?.root).toBe(document.querySelector('main'))
    expect(observer.options?.rootMargin).toBe('0px 0px -60% 0px')
  })

  it('activates the section the observer reports as visible', () => {
    useMockObserver()
    renderNav()
    latestObserver().trigger([
      ['profile', false],
      ['calendar', true],
    ])
    expect(activeTabName()).toBe('Calendar')
  })

  // Browser QA (settings-tabs-w1, issue #3) refuted the original "first in
  // document order" rule: a tall section still spans the spy band while the
  // next section's top has already entered it, so clicking the last tab left
  // the previous one lit. The deepest visible section is the correct choice.
  it('prefers the deepest section when several are visible at once', () => {
    useMockObserver()
    renderNav()
    latestObserver().trigger([
      ['calendar', true],
      ['integrations', true],
    ])
    expect(activeTabName()).toBe('Integrations')
  })

  it('ignores document order in the entry list when choosing the deepest', () => {
    useMockObserver()
    renderNav()
    latestObserver().trigger([
      ['integrations', true],
      ['calendar', true],
    ])
    expect(activeTabName()).toBe('Integrations')
  })

  it('seeds the active tab from the URL hash', () => {
    useMockObserver()
    window.location.hash = '#integrations'
    renderNav()
    expect(activeTabName()).toBe('Integrations')
  })

  it('ignores a hash that names no section', () => {
    useMockObserver()
    window.location.hash = '#nonsense'
    renderNav()
    expect(activeTabName()).toBe('Profile')
  })

  it('lets a newly clicked tab win over the last observed section', () => {
    useMockObserver()
    renderNav()
    latestObserver().trigger([['integrations', true]])
    expect(activeTabName()).toBe('Integrations')
    act(() => {
      window.location.hash = '#calendar'
      window.dispatchEvent(new Event('hashchange'))
    })
    expect(activeTabName()).toBe('Calendar')
  })

  it('renders without throwing when IntersectionObserver is unavailable', () => {
    // @ts-expect-error — deleting a global to simulate an environment without the API
    delete globalThis.IntersectionObserver
    expect(() => renderNav()).not.toThrow()
    expect(activeTabName()).toBe('Profile')
  })

  it('constructs no observer when the sections are absent from the DOM', () => {
    useMockObserver()
    render(<SettingsNav />)
    expect(MockIntersectionObserver.instances).toHaveLength(0)
  })

  it('disconnects the observer on unmount', () => {
    useMockObserver()
    const { unmount } = render(
      <main>
        <SettingsNav />
        <section id="profile">Profile</section>
        <section id="calendar">Calendar</section>
        <section id="integrations">Integrations</section>
      </main>,
    )
    const observer = latestObserver()
    unmount()
    expect(observer.disconnected).toBe(true)
  })

  it('exports section ids the page must use verbatim', async () => {
    const { SETTINGS_SECTIONS } = await import('@/app/(app)/settings/settings-nav')
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      'profile',
      'calendar',
      'integrations',
    ])
  })

  it('has no axe violations in dark and light themes', async () => {
    useMockObserver()
    renderNav()
    for (const theme of ['dark', 'light']) {
      document.documentElement.className = theme
      expect(await axe(document.body)).toHaveNoViolations()
    }
    document.documentElement.className = ''
  })
})
