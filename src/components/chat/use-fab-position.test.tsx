import * as React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  useFabPosition,
  DRAG_THRESHOLD_PX,
  FAB_PADDING_PX,
  FAB_TOP_PADDING_PX,
  BAR_GAP_PX,
  SNAP_TRANSITION_MS,
  FAB_Z_INDEX,
  type FabCorner,
} from './use-fab-position'

const VIEWPORT_WIDTH = 1024
const VIEWPORT_HEIGHT = 768
const FAB_SIZE = 56
const STORAGE_KEY = 'chat-fab-position'
const SIDEBAR_WIDTH = 256
const COLLAPSED_SIDEBAR_WIDTH = 56

// Default (never-dragged) fab sits at the bottom-right corner with 24px padding.
const DEFAULT_FAB_LEFT = VIEWPORT_WIDTH - FAB_SIZE - FAB_PADDING_PX // 944
const DEFAULT_FAB_TOP = VIEWPORT_HEIGHT - FAB_SIZE - FAB_PADDING_PX // 688
// Left/top pixels for a fab parked at the top-left corner (no sidebar mounted).
const TOP_LEFT_LEFT = BAR_GAP_PX // 8
const TOP_LEFT_TOP = FAB_TOP_PADDING_PX // 56

function setViewport(width: number, height: number): void {
  window.innerWidth = width
  window.innerHeight = height
}

interface StoredCornerLike {
  readonly corner: FabCorner
}

function storeCorner(corner: FabCorner): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ corner } satisfies StoredCornerLike))
}

function storeLegacy(edge: 'left' | 'right' | 'top' | 'bottom', offset: number): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ edge, offset }))
}

// happy-dom lays out nothing, so the sidebar's measured width is mocked; the
// hook only reads getBoundingClientRect().width.
function mountSidebar(width: number): HTMLElement {
  const aside = document.createElement('aside')
  aside.setAttribute('aria-label', 'Main sidebar')
  setSidebarWidth(aside, width)
  document.body.appendChild(aside)
  return aside
}

function setSidebarWidth(aside: HTMLElement, width: number): void {
  aside.getBoundingClientRect = () => ({ width }) as DOMRect
}

// happy-dom's ResizeObserver never fires (no layout), so the observer contract
// is exercised through this mock: tests trigger the callback manually after
// changing the mocked sidebar width.
class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  readonly targets: Element[] = []
  disconnected = false
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  observe(objectTarget: Element): void {
    this.targets.push(objectTarget)
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver)
  }
}

function firstObserver(): MockResizeObserver {
  const observer = MockResizeObserver.instances[0]
  if (!observer) throw new Error('no ResizeObserver was constructed')
  return observer
}

function Harness(): React.JSX.Element {
  const { fabStyle, panelStyle, handlers, consumeDrag } = useFabPosition()
  const [consumed, setConsumed] = React.useState<string>('unknown')
  return (
    <div>
      <div data-testid="target" style={fabStyle} {...handlers}>
        fab
      </div>
      <div data-testid="panel" style={panelStyle} />
      <span data-testid="fab-style">{fabStyle ? JSON.stringify(fabStyle) : 'none'}</span>
      <span data-testid="panel-style">{panelStyle ? JSON.stringify(panelStyle) : 'none'}</span>
      <span data-testid="consumed">{consumed}</span>
      <button data-testid="consume" onClick={() => setConsumed(String(consumeDrag()))}>
        consume
      </button>
    </div>
  )
}

// Records fabStyle on every render pass (render body, before effects flush) so a
// test can distinguish the first/hydration render from the post-mount-effect render.
function RenderRecorder({
  record,
}: {
  readonly record: (style: React.CSSProperties | undefined) => void
}): React.JSX.Element {
  const { fabStyle } = useFabPosition()
  record(fabStyle)
  return <div />
}

function target(): HTMLElement {
  return screen.getByTestId('target')
}

function readStyleFromSpan(testId: string): React.CSSProperties | undefined {
  const text = screen.getByTestId(testId).textContent
  return text === 'none' || text === null ? undefined : (JSON.parse(text) as React.CSSProperties)
}

function fabStyleNow(): React.CSSProperties | undefined {
  return readStyleFromSpan('fab-style')
}

function panelStyleNow(): React.CSSProperties | undefined {
  return readStyleFromSpan('panel-style')
}

function pointerDown(clientX: number, clientY: number): void {
  fireEvent.pointerDown(target(), { clientX, clientY, pointerId: 1 })
}
function pointerMove(clientX: number, clientY: number): void {
  fireEvent.pointerMove(target(), { clientX, clientY, pointerId: 1 })
}
function pointerUp(clientX: number, clientY: number): void {
  fireEvent.pointerUp(target(), { clientX, clientY, pointerId: 1 })
}

function storedCorner(): FabCorner {
  const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as StoredCornerLike
  return stored.corner
}

// happy-dom's matchMedia support is not guaranteed; tests that care about the
// prefers-reduced-motion branch stub it explicitly for a deterministic result.
function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

describe('useFabPosition', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  })

  afterEach(() => {
    document.querySelectorAll('aside[aria-label="Main sidebar"]').forEach((aside) => aside.remove())
  })

  describe('default (no stored position)', () => {
    it('renders no inline fab or panel style so the CSS-class placement is used', () => {
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
      expect(panelStyleNow()).toBeUndefined()
    })
  })

  describe('hydration safety (no localStorage read on first render)', () => {
    it('yields an SSR-safe first render then applies the stored position after mount', () => {
      // A hydration mismatch loses the persisted fab position on reload: the
      // first client render must match the server render (which has no window),
      // i.e. fabStyle undefined, and only the post-mount effect may apply the
      // stored position.
      storeCorner('top-left')
      const renders: (React.CSSProperties | undefined)[] = []
      render(<RenderRecorder record={(style) => renders.push(style)} />)

      // First render must not depend on localStorage -> matches SSR default.
      expect(renders[0]).toBeUndefined()
      // After the mount effect flushes, the stored top-left corner is applied
      // (no sidebar in the test DOM, so the left boundary is just the bar gap).
      expect(renders[renders.length - 1]).toMatchObject({
        position: 'fixed',
        left: TOP_LEFT_LEFT,
        top: TOP_LEFT_TOP,
      })
    })
  })

  describe('restore from localStorage', () => {
    it('places the fab at the top-left corner from a stored top-left position', () => {
      storeCorner('top-left')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({
        position: 'fixed',
        left: TOP_LEFT_LEFT,
        top: TOP_LEFT_TOP,
      })
    })

    it('places the fab at the top-right corner from a stored top-right position', () => {
      storeCorner('top-right')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: TOP_LEFT_TOP })
    })

    it('places the fab at the bottom-left corner from a stored bottom-left position', () => {
      storeCorner('bottom-left')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: TOP_LEFT_LEFT, top: DEFAULT_FAB_TOP })
    })

    it('places the fab at the bottom-right corner from a stored bottom-right position', () => {
      storeCorner('bottom-right')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: DEFAULT_FAB_TOP })
    })
  })

  describe('legacy {edge, offset} migration', () => {
    // Stored shape from before the corner-snap model. It parses to the corner
    // the fab visually occupied: edge left/right picks top-*/bottom-* by
    // offset (< 0.5 = top, else bottom); edge top/bottom picks *-left/*-right
    // by offset (< 0.5 = left, else right). Exact 0.5 takes the else branch.
    it('maps a low-offset left edge to top-left', () => {
      storeLegacy('left', 0)
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: TOP_LEFT_LEFT, top: TOP_LEFT_TOP })
    })

    it('maps an exact-0.5-offset left edge to bottom-left (else branch)', () => {
      storeLegacy('left', 0.5)
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: TOP_LEFT_LEFT, top: DEFAULT_FAB_TOP })
    })

    it('maps a low-offset right edge to top-right', () => {
      storeLegacy('right', 0.25)
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: TOP_LEFT_TOP })
    })

    it('maps a high-offset right edge to bottom-right', () => {
      storeLegacy('right', 1)
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: DEFAULT_FAB_TOP })
    })

    it('maps a low-offset top edge to top-left', () => {
      storeLegacy('top', 0)
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: TOP_LEFT_LEFT, top: TOP_LEFT_TOP })
    })

    it('maps a high-offset top edge to top-right', () => {
      storeLegacy('top', 0.5)
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: TOP_LEFT_TOP })
    })

    it('maps a low-offset bottom edge to bottom-left', () => {
      storeLegacy('bottom', 0.3)
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: TOP_LEFT_LEFT, top: DEFAULT_FAB_TOP })
    })

    it('maps a high-offset bottom edge to bottom-right', () => {
      storeLegacy('bottom', 1)
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: DEFAULT_FAB_TOP })
    })
  })

  describe('sidebar-aware left boundary', () => {
    it('places a top-left fab just clear of the expanded sidebar', () => {
      mountSidebar(SIDEBAR_WIDTH)
      storeCorner('top-left')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({
        left: SIDEBAR_WIDTH + BAR_GAP_PX,
        top: FAB_TOP_PADDING_PX,
      })
    })

    it('anchors a top-left panel just clear of the sidebar and topbar', () => {
      mountSidebar(SIDEBAR_WIDTH)
      storeCorner('top-left')
      render(<Harness />)
      expect(panelStyleNow()).toMatchObject({
        position: 'fixed',
        left: SIDEBAR_WIDTH + BAR_GAP_PX,
        top: FAB_TOP_PADDING_PX,
      })
    })

    it('clamps a live drag at the sidebar boundary, not the viewport edge', () => {
      mountSidebar(SIDEBAR_WIDTH)
      storeCorner('top-right')
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, 356)
      pointerMove(-500, 400)
      expect(fabStyleNow()).toMatchObject({ left: SIDEBAR_WIDTH + BAR_GAP_PX })
    })

    it('follows a sidebar collapse/expand live via ResizeObserver', () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver)
      MockResizeObserver.instances = []
      const aside = mountSidebar(SIDEBAR_WIDTH)
      storeCorner('top-left')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: SIDEBAR_WIDTH + BAR_GAP_PX })

      const observer = firstObserver()
      expect(observer.targets).toContain(aside)

      // Collapse: the parked fab and its open panel both slide in with the bar.
      act(() => {
        setSidebarWidth(aside, COLLAPSED_SIDEBAR_WIDTH)
        observer.trigger()
      })
      expect(fabStyleNow()).toMatchObject({ left: COLLAPSED_SIDEBAR_WIDTH + BAR_GAP_PX })
      expect(panelStyleNow()).toMatchObject({ left: COLLAPSED_SIDEBAR_WIDTH + BAR_GAP_PX })

      // Expand: back out.
      act(() => {
        setSidebarWidth(aside, SIDEBAR_WIDTH)
        observer.trigger()
      })
      expect(fabStyleNow()).toMatchObject({ left: SIDEBAR_WIDTH + BAR_GAP_PX })
      vi.unstubAllGlobals()
    })

    it('disconnects the sidebar observer on unmount', () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver)
      MockResizeObserver.instances = []
      mountSidebar(SIDEBAR_WIDTH)
      const { unmount } = render(<Harness />)
      unmount()
      expect(firstObserver().disconnected).toBe(true)
      vi.unstubAllGlobals()
    })

    it('creates no observer when no sidebar exists', () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver)
      MockResizeObserver.instances = []
      render(<Harness />)
      expect(MockResizeObserver.instances).toHaveLength(0)
      vi.unstubAllGlobals()
    })

    it('still measures once when ResizeObserver is unavailable', () => {
      vi.stubGlobal('ResizeObserver', undefined)
      mountSidebar(SIDEBAR_WIDTH)
      storeCorner('top-left')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: SIDEBAR_WIDTH + BAR_GAP_PX })
      vi.unstubAllGlobals()
    })

    it('re-measures the sidebar on pointer-down so a collapsed sidebar frees the space', () => {
      const aside = mountSidebar(SIDEBAR_WIDTH)
      storeCorner('top-left')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: SIDEBAR_WIDTH + BAR_GAP_PX })

      setSidebarWidth(aside, COLLAPSED_SIDEBAR_WIDTH)
      pointerDown(SIDEBAR_WIDTH + BAR_GAP_PX, 400)
      pointerMove(-500, 400)
      pointerUp(-500, 400)

      expect(storedCorner()).toBe('top-left')
      expect(fabStyleNow()).toMatchObject({ left: COLLAPSED_SIDEBAR_WIDTH + BAR_GAP_PX })
    })
  })

  describe('corrupt / invalid stored value falls back to default', () => {
    it('ignores non-JSON garbage', () => {
      window.localStorage.setItem(STORAGE_KEY, '{not json')
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })

    it('ignores JSON that is not an object', () => {
      window.localStorage.setItem(STORAGE_KEY, '"left"')
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })

    it('ignores JSON null', () => {
      window.localStorage.setItem(STORAGE_KEY, 'null')
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })

    it('ignores an unknown corner', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ corner: 'diagonal' }))
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })

    it('ignores an unknown legacy edge', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ edge: 'diagonal', offset: 0.5 }))
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })

    it('ignores a non-numeric legacy offset', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ edge: 'left', offset: 'nope' }))
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })

    it('ignores a non-finite legacy offset', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ edge: 'left', offset: null }))
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })
  })

  describe('panel anchoring (same corner as the fab)', () => {
    it('anchors the panel to the top-left corner', () => {
      storeCorner('top-left')
      render(<Harness />)
      expect(panelStyleNow()).toMatchObject({
        position: 'fixed',
        left: BAR_GAP_PX,
        top: FAB_TOP_PADDING_PX,
      })
    })

    it('anchors the panel to the top-right corner', () => {
      storeCorner('top-right')
      render(<Harness />)
      expect(panelStyleNow()).toMatchObject({
        position: 'fixed',
        left: VIEWPORT_WIDTH - 380 - FAB_PADDING_PX,
        top: FAB_TOP_PADDING_PX,
      })
    })

    it('anchors the panel to the bottom-left corner', () => {
      storeCorner('bottom-left')
      render(<Harness />)
      expect(panelStyleNow()).toMatchObject({
        position: 'fixed',
        left: BAR_GAP_PX,
        top: VIEWPORT_HEIGHT - 560 - FAB_PADDING_PX,
      })
    })

    it('anchors the panel to the bottom-right corner', () => {
      storeCorner('bottom-right')
      render(<Harness />)
      // Panel (380x560) opens up-left, pinned at the bottom-right with 24px padding.
      expect(panelStyleNow()).toMatchObject({
        position: 'fixed',
        left: VIEWPORT_WIDTH - 380 - FAB_PADDING_PX, // 620
        top: VIEWPORT_HEIGHT - 560 - FAB_PADDING_PX, // 184
      })
    })
  })

  describe('drag + snap to the nearest corner', () => {
    it('snaps to the top-left corner when released near it', () => {
      storeCorner('bottom-right')
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(30, 80)
      pointerUp(30, 80)

      expect(storedCorner()).toBe('top-left')
      expect(fabStyleNow()).toMatchObject({ left: BAR_GAP_PX, top: FAB_TOP_PADDING_PX })
    })

    it('snaps to the top-right corner when released near it', () => {
      storeCorner('bottom-left')
      render(<Harness />)
      pointerDown(BAR_GAP_PX, DEFAULT_FAB_TOP)
      pointerMove(990, 80)
      pointerUp(990, 80)

      expect(storedCorner()).toBe('top-right')
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: FAB_TOP_PADDING_PX })
    })

    it('snaps to the bottom-left corner when released near it', () => {
      storeCorner('top-right')
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, FAB_TOP_PADDING_PX)
      pointerMove(30, 700)
      pointerUp(30, 700)

      expect(storedCorner()).toBe('bottom-left')
      expect(fabStyleNow()).toMatchObject({ left: BAR_GAP_PX, top: DEFAULT_FAB_TOP })
    })

    it('snaps to the bottom-right corner when released near it', () => {
      storeCorner('top-left')
      render(<Harness />)
      pointerDown(BAR_GAP_PX, FAB_TOP_PADDING_PX)
      pointerMove(990, 700)
      pointerUp(990, 700)

      expect(storedCorner()).toBe('bottom-right')
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: DEFAULT_FAB_TOP })
    })

    it('leaves the live drag pixel free mid-drag, not snapped to any corner', () => {
      // A mid-viewport interior point is not equal to any of the 4 resting
      // corner pixels -- the fab must track the raw pointer while dragging and
      // only snap once the pointer is released.
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(500, 400)
      expect(fabStyleNow()).toMatchObject({ left: 500, top: 400 })
    })

    it('clamps the live drag position inside the usable area', () => {
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      // Drag far past the top-left corner.
      pointerMove(-500, -500)
      // Top clamps to the topbar clearance; left to the bar gap (no sidebar here).
      expect(fabStyleNow()).toMatchObject({ left: BAR_GAP_PX, top: FAB_TOP_PADDING_PX })
    })

    it('marks a drag as consumable exactly once', () => {
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(30, 400)
      pointerUp(30, 400)

      fireEvent.click(screen.getByTestId('consume'))
      expect(screen.getByTestId('consumed')).toHaveTextContent('true')

      fireEvent.click(screen.getByTestId('consume'))
      expect(screen.getByTestId('consumed')).toHaveTextContent('false')
    })
  })

  describe('stale drag-consume flag (real-browser click retargeting)', () => {
    it('clears a stale pending-consume flag on a fresh press so the next real click still opens', () => {
      render(<Harness />)
      // A real browser retargets the post-drag click to the pointer-capture
      // wrapper (not the ChatFab button), so consumeDrag() is never called
      // here -- this mirrors that: a full drag releases with the flag left
      // set and NOTHING reads it.
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(30, 400)
      pointerUp(30, 400)

      // A fresh press-and-release with no threshold crossed is a plain click,
      // not a drag -- it must not inherit the previous drag's stale flag.
      pointerDown(BAR_GAP_PX, FAB_TOP_PADDING_PX)
      pointerUp(BAR_GAP_PX, FAB_TOP_PADDING_PX)

      fireEvent.click(screen.getByTestId('consume'))
      expect(screen.getByTestId('consumed')).toHaveTextContent('false')
    })
  })

  describe('corner-snap glide animation', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    })

    it('adds a left/top CSS transition to fabStyle once a real drag releases', () => {
      stubMatchMedia(false)
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(30, 80)
      pointerUp(30, 80)

      const transition = fabStyleNow()?.transition
      expect(transition).toEqual(expect.stringContaining('left'))
      expect(transition).toEqual(expect.stringContaining('top'))
      expect(transition).toEqual(expect.stringContaining(`${SNAP_TRANSITION_MS}ms`))
    })

    it('keeps the fab tracking the pointer 1:1 mid-drag, with no transition applied', () => {
      stubMatchMedia(false)
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(500, 400)

      const style = fabStyleNow()
      expect(style).toMatchObject({ left: 500, top: 400 })
      expect(style?.transition).toBeUndefined()
    })

    it('never animates the first post-mount render, even when a corner is already stored', () => {
      storeCorner('top-left')
      const renders: (React.CSSProperties | undefined)[] = []
      render(<RenderRecorder record={(style) => renders.push(style)} />)

      for (const style of renders) {
        expect(style?.transition).toBeUndefined()
      }
    })

    it('skips the glide entirely when prefers-reduced-motion is set, snapping instantly', () => {
      stubMatchMedia(true)
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(30, 80)
      pointerUp(30, 80)

      expect(fabStyleNow()?.transition).toBeUndefined()
      // Reduced motion removes the animation only -- the corner snap itself
      // still applies.
      expect(storedCorner()).toBe('top-left')
      expect(fabStyleNow()).toMatchObject({ left: BAR_GAP_PX, top: FAB_TOP_PADDING_PX })
    })

    it('clears the transition once the settle duration elapses, leaving the fab at the corner', () => {
      vi.useFakeTimers()
      stubMatchMedia(false)
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(30, 80)
      pointerUp(30, 80)
      expect(fabStyleNow()?.transition).toBeDefined()

      act(() => {
        vi.advanceTimersByTime(SNAP_TRANSITION_MS)
      })

      expect(fabStyleNow()?.transition).toBeUndefined()
      expect(fabStyleNow()).toMatchObject({ left: BAR_GAP_PX, top: FAB_TOP_PADDING_PX })
    })

    it('cancels a pending settle timeout when a new drag starts before the glide finishes', () => {
      vi.useFakeTimers()
      stubMatchMedia(false)
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(30, 80)
      pointerUp(30, 80)
      expect(fabStyleNow()?.transition).toBeDefined()

      pointerDown(BAR_GAP_PX, FAB_TOP_PADDING_PX)
      expect(fabStyleNow()?.transition).toBeUndefined()
    })
  })

  describe('z-index parity with the lib fixed fab (stays above calendar sleep shading)', () => {
    it('carries the lib fixed-variant z-index while dragging live', () => {
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(500, 400)
      expect(fabStyleNow()).toMatchObject({ zIndex: FAB_Z_INDEX })
    })

    it('carries the lib fixed-variant z-index once settled at a stored corner', () => {
      storeCorner('top-left')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ zIndex: FAB_Z_INDEX })
    })

    it('carries the z-index through the post-release settle glide too', () => {
      stubMatchMedia(false)
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(30, 80)
      pointerUp(30, 80)
      expect(fabStyleNow()).toMatchObject({ zIndex: FAB_Z_INDEX })
      vi.unstubAllGlobals()
    })
  })

  describe('lazy pointer capture (a plain click reaches the button)', () => {
    it('does not capture the pointer on pointer-down', () => {
      // Capturing on pointer-down retargets the synthetic click to the wrapper,
      // so the ChatFab button never receives it and the panel never opens.
      render(<Harness />)
      const captureSpy = vi.spyOn(target(), 'setPointerCapture')
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      expect(captureSpy).not.toHaveBeenCalled()
      captureSpy.mockRestore()
    })

    it('captures the pointer exactly once when a drag crosses the threshold', () => {
      render(<Harness />)
      const captureSpy = vi.spyOn(target(), 'setPointerCapture')
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(DEFAULT_FAB_LEFT - 100, DEFAULT_FAB_TOP - 100)
      pointerMove(DEFAULT_FAB_LEFT - 150, DEFAULT_FAB_TOP - 150)
      expect(captureSpy).toHaveBeenCalledTimes(1)
      expect(captureSpy).toHaveBeenCalledWith(1)
      captureSpy.mockRestore()
    })

    it('does not release capture and stays non-consumable on a plain down+up', () => {
      render(<Harness />)
      const releaseSpy = vi.spyOn(target(), 'releasePointerCapture')
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerUp(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      expect(releaseSpy).not.toHaveBeenCalled()

      // No drag was consumed, so the click handler is free to open the panel.
      fireEvent.click(screen.getByTestId('consume'))
      expect(screen.getByTestId('consumed')).toHaveTextContent('false')
      releaseSpy.mockRestore()
    })

    it('releases the captured pointer after a genuine drag', () => {
      render(<Harness />)
      const releaseSpy = vi.spyOn(target(), 'releasePointerCapture')
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(30, 400)
      pointerUp(30, 400)
      expect(releaseSpy).toHaveBeenCalledWith(1)
      releaseSpy.mockRestore()
    })
  })

  describe('sub-threshold release is a tap, not a drag', () => {
    it('does not persist and is not consumable when movement stays under the threshold', () => {
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      pointerMove(DEFAULT_FAB_LEFT + DRAG_THRESHOLD_PX - 1, DEFAULT_FAB_TOP)
      pointerUp(DEFAULT_FAB_LEFT + DRAG_THRESHOLD_PX - 1, DEFAULT_FAB_TOP)

      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(fabStyleNow()).toBeUndefined()

      fireEvent.click(screen.getByTestId('consume'))
      expect(screen.getByTestId('consumed')).toHaveTextContent('false')
    })
  })

  describe('stray pointer events without a preceding pointerdown', () => {
    it('ignores a pointermove with no active drag', () => {
      render(<Harness />)
      pointerMove(100, 100)
      expect(fabStyleNow()).toBeUndefined()
    })

    it('ignores a pointerup with no active drag', () => {
      render(<Harness />)
      pointerUp(100, 100)
      expect(fabStyleNow()).toBeUndefined()
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  describe('resize', () => {
    it('recomputes the fab pixel position from the stored corner on resize', () => {
      storeCorner('bottom-right')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT })

      act(() => {
        setViewport(1400, 900)
        window.dispatchEvent(new Event('resize'))
      })

      expect(fabStyleNow()).toMatchObject({
        left: 1400 - FAB_SIZE - FAB_PADDING_PX,
        top: 900 - FAB_SIZE - FAB_PADDING_PX,
      })
    })

    it('re-measures the sidebar on resize', () => {
      const aside = mountSidebar(SIDEBAR_WIDTH)
      storeCorner('top-left')
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: SIDEBAR_WIDTH + BAR_GAP_PX })

      act(() => {
        setSidebarWidth(aside, COLLAPSED_SIDEBAR_WIDTH)
        window.dispatchEvent(new Event('resize'))
      })

      expect(fabStyleNow()).toMatchObject({ left: COLLAPSED_SIDEBAR_WIDTH + BAR_GAP_PX })
    })

    it('removes the resize listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const { unmount } = render(<Harness />)
      unmount()
      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
      removeSpy.mockRestore()
    })
  })
})
