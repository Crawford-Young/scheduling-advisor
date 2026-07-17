import * as React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  useFabPosition,
  DRAG_THRESHOLD_PX,
  FAB_PADDING_PX,
  FAB_TOP_PADDING_PX,
  type FabPosition,
} from './use-fab-position'

const VIEWPORT_WIDTH = 1024
const VIEWPORT_HEIGHT = 768
const FAB_SIZE = 56
const STORAGE_KEY = 'chat-fab-position'

// Default (never-dragged) fab sits at the bottom-right corner with 24px padding.
const DEFAULT_FAB_LEFT = VIEWPORT_WIDTH - FAB_SIZE - FAB_PADDING_PX // 944
const DEFAULT_FAB_TOP = VIEWPORT_HEIGHT - FAB_SIZE - FAB_PADDING_PX // 688

function setViewport(width: number, height: number): void {
  window.innerWidth = width
  window.innerHeight = height
}

function storePosition(position: FabPosition): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
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

describe('useFabPosition', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
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
      storePosition({ edge: 'left', offset: 0.5 })
      const renders: (React.CSSProperties | undefined)[] = []
      render(<RenderRecorder record={(style) => renders.push(style)} />)

      // First render must not depend on localStorage -> matches SSR default.
      expect(renders[0]).toBeUndefined()
      // After the mount effect flushes, the stored left-edge position is applied.
      expect(renders[renders.length - 1]).toMatchObject({
        position: 'fixed',
        left: FAB_PADDING_PX,
      })
    })
  })

  describe('restore from localStorage', () => {
    it('places the fab at the left edge from a stored left position', () => {
      storePosition({ edge: 'left', offset: 0 })
      render(<Harness />)
      // offset 0 sits at the top clearance (80), clearing the 48px app topbar.
      expect(fabStyleNow()).toMatchObject({
        position: 'fixed',
        left: FAB_PADDING_PX,
        top: FAB_TOP_PADDING_PX,
      })
    })

    it('places the fab at the right edge from a stored right position', () => {
      storePosition({ edge: 'right', offset: 1 })
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: DEFAULT_FAB_TOP })
    })

    it('places the fab at the top edge clear of the app topbar', () => {
      storePosition({ edge: 'top', offset: 0 })
      render(<Harness />)
      // The top edge pins at FAB_TOP_PADDING_PX (72), NOT FAB_PADDING_PX (24),
      // so the fab never overlaps the 48px fixed app topbar / token chip.
      expect(fabStyleNow()).toMatchObject({ left: FAB_PADDING_PX, top: FAB_TOP_PADDING_PX })
    })

    it('places the fab at the bottom edge from a stored bottom position', () => {
      storePosition({ edge: 'bottom', offset: 1 })
      render(<Harness />)
      expect(fabStyleNow()).toMatchObject({ left: DEFAULT_FAB_LEFT, top: DEFAULT_FAB_TOP })
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

    it('ignores an unknown edge', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ edge: 'diagonal', offset: 0.5 }))
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })

    it('ignores a non-numeric offset', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ edge: 'left', offset: 'nope' }))
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })

    it('ignores a non-finite offset', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ edge: 'left', offset: null }))
      render(<Harness />)
      expect(fabStyleNow()).toBeUndefined()
    })
  })

  describe('panel anchoring', () => {
    it('anchors the panel to the bottom-right corner for the default-equivalent right position', () => {
      storePosition({ edge: 'right', offset: 1 })
      render(<Harness />)
      // Panel (380x560) opens up-left, pinned at the bottom-right with 24px padding.
      expect(panelStyleNow()).toMatchObject({
        position: 'fixed',
        left: VIEWPORT_WIDTH - 380 - FAB_PADDING_PX, // 620
        top: VIEWPORT_HEIGHT - 560 - FAB_PADDING_PX, // 184
      })
    })

    it('flips the panel to open down-right when the fab is at the top-left', () => {
      storePosition({ edge: 'left', offset: 0 })
      render(<Harness />)
      expect(panelStyleNow()).toMatchObject({
        position: 'fixed',
        left: FAB_PADDING_PX,
        top: FAB_PADDING_PX,
      })
    })
  })

  describe('drag + snap', () => {
    // Each case starts from a mid-edge stored position (never a corner) so the
    // drag lands unambiguously closer to exactly one edge -- starting from the
    // default bottom-right corner ties two edges simultaneously.
    it('snaps to the left edge when released near the left', () => {
      storePosition({ edge: 'right', offset: 0.5 })
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, 356)
      pointerMove(30, 400)
      pointerUp(30, 400)

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as FabPosition
      expect(stored.edge).toBe('left')
      expect(fabStyleNow()).toMatchObject({ left: FAB_PADDING_PX })
    })

    it('snaps to the right edge when released near the right', () => {
      storePosition({ edge: 'left', offset: 0.5 })
      render(<Harness />)
      pointerDown(FAB_PADDING_PX, 356)
      pointerMove(994, 400)
      pointerUp(994, 400)

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as FabPosition
      expect(stored.edge).toBe('right')
    })

    it('snaps to the top edge when released near the top', () => {
      storePosition({ edge: 'bottom', offset: 0.5 })
      render(<Harness />)
      pointerDown(484, DEFAULT_FAB_TOP)
      pointerMove(500, 30)
      pointerUp(500, 30)

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as FabPosition
      expect(stored.edge).toBe('top')
    })

    it('snaps to the bottom edge when released near the bottom', () => {
      storePosition({ edge: 'top', offset: 0.5 })
      render(<Harness />)
      pointerDown(484, FAB_PADDING_PX)
      pointerMove(500, VIEWPORT_HEIGHT - 30)
      pointerUp(500, VIEWPORT_HEIGHT - 30)

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as FabPosition
      expect(stored.edge).toBe('bottom')
    })

    it('clamps the live drag position inside the viewport minus padding', () => {
      render(<Harness />)
      pointerDown(DEFAULT_FAB_LEFT, DEFAULT_FAB_TOP)
      // Drag far past the top-left corner.
      pointerMove(-500, -500)
      // Top clamps to the topbar clearance (80), not the 24px side padding.
      expect(fabStyleNow()).toMatchObject({ left: FAB_PADDING_PX, top: FAB_TOP_PADDING_PX })
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

    it('falls back to offset 0 for a top/bottom snap when the horizontal track is exhausted', () => {
      // A viewport smaller than the fab + double padding collapses the usable
      // horizontal track to zero -- the offset math must not divide by zero.
      setViewport(100, 100)
      storePosition({ edge: 'right', offset: 0.5 })
      render(<Harness />)
      pointerDown(20, 20)
      pointerMove(10, 60)
      pointerUp(10, 60)

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as FabPosition
      expect(stored.edge).toBe('bottom')
      expect(stored.offset).toBe(0)
    })

    it('falls back to offset 0 for a left/right snap when the vertical track is exhausted', () => {
      // A viewport no taller than fab + top clearance + bottom padding collapses
      // the usable vertical track to zero -- the offset math must not divide by
      // zero. Width 100 keeps the right edge the nearest (right distance 20 < the
      // clamped bottom distance 24), so the left/right offset branch is exercised.
      setViewport(100, 152)
      storePosition({ edge: 'right', offset: 0.5 })
      render(<Harness />)
      pointerDown(20, 20)
      pointerMove(10, 60)
      pointerUp(10, 60)

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as FabPosition
      expect(stored.edge).toBe('right')
      expect(stored.offset).toBe(0)
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
    it('recomputes the fab pixel position from the stored fraction on resize', () => {
      storePosition({ edge: 'right', offset: 1 })
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

    it('removes the resize listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const { unmount } = render(<Harness />)
      unmount()
      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
      removeSpy.mockRestore()
    })
  })
})
