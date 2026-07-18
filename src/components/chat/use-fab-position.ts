'use client'
import * as React from 'react'

export const DRAG_THRESHOLD_PX = 5
// Padding kept from the open right/bottom viewport edges (no app chrome there).
export const FAB_PADDING_PX = 24
// "Barely not touching" clearance kept between the fab/panel and the app
// chrome bars (topbar, sidebar).
export const BAR_GAP_PX = 8
const TOPBAR_HEIGHT_PX = 48
// Clears the app topbar by BAR_GAP_PX. The fab is hidden on /chat so all
// fab-visible pages share this bar.
export const FAB_TOP_PADDING_PX = TOPBAR_HEIGHT_PX + BAR_GAP_PX

const FAB_SIZE_PX = 56
const PANEL_WIDTH_PX = 380
const PANEL_HEIGHT_PX = 560
const STORAGE_KEY = 'chat-fab-position'
const MIN_OFFSET = 0
const MAX_OFFSET = 1
const HALF = 0.5
const SIDEBAR_SELECTOR = 'aside[aria-label="Main sidebar"]'

export type FabEdge = 'left' | 'right' | 'top' | 'bottom'

export interface FabPosition {
  readonly edge: FabEdge
  readonly offset: number
}

interface FabPixelPosition {
  readonly left: number
  readonly top: number
}

interface FabPositionHandlers {
  readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
}

export interface UseFabPositionResult {
  readonly fabStyle: React.CSSProperties | undefined
  readonly panelStyle: React.CSSProperties | undefined
  readonly handlers: FabPositionHandlers
  readonly consumeDrag: () => boolean
}

interface DragState {
  readonly startX: number
  readonly startY: number
  readonly originLeft: number
  readonly originTop: number
  readonly pointerId: number
  active: boolean
}

const VALID_EDGES: readonly FabEdge[] = ['left', 'right', 'top', 'bottom']
const DEFAULT_POSITION: FabPosition = { edge: 'right', offset: 1 }

function isFabEdge(value: unknown): value is FabEdge {
  return typeof value === 'string' && (VALID_EDGES as readonly string[]).includes(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function parseStoredPosition(raw: string | null): FabPosition | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as { edge?: unknown; offset?: unknown }
    if (!isFabEdge(candidate.edge)) return null
    if (typeof candidate.offset !== 'number' || !Number.isFinite(candidate.offset)) return null
    return { edge: candidate.edge, offset: clamp(candidate.offset, MIN_OFFSET, MAX_OFFSET) }
  } catch {
    return null
  }
}

// SSR guard: same rationale as readViewportSize above -- accepted per-line gap.
function readStoredPosition(): FabPosition | null {
  if (typeof window === 'undefined') return null
  return parseStoredPosition(window.localStorage.getItem(STORAGE_KEY))
}

interface ViewportSize {
  readonly width: number
  readonly height: number
}

const EMPTY_VIEWPORT: ViewportSize = { width: 0, height: 0 }

// SSR guard: ChatPopup renders on the server (no `next/dynamic` ssr:false), so
// this initializer runs once during the server render pass where `window` is
// genuinely undefined. Not exercisable in the jsdom/happy-dom test environment
// (`window` always exists there) -- accepted per-line branch coverage gap.
function readViewportSize(): ViewportSize {
  if (typeof window === 'undefined') return EMPTY_VIEWPORT
  return { width: window.innerWidth, height: window.innerHeight }
}

// The sidebar collapses between w-64 and w-14 client-side, so its width must
// be measured from the DOM, never assumed. 0 when absent. Only called from
// effects/event handlers, which never run during the server render pass.
function readSidebarWidth(): number {
  const aside = document.querySelector(SIDEBAR_SELECTOR)
  return aside ? aside.getBoundingClientRect().width : 0
}

// Left travel limit: the fab/panel stops just clear of the sidebar, never on it.
function leftBoundary(sidebarWidth: number): number {
  return sidebarWidth + BAR_GAP_PX
}

function horizontalRange(viewportWidth: number, sidebarWidth: number): number {
  return Math.max(viewportWidth - FAB_SIZE_PX - leftBoundary(sidebarWidth) - FAB_PADDING_PX, 0)
}

function verticalRange(viewportHeight: number): number {
  return Math.max(viewportHeight - FAB_SIZE_PX - FAB_TOP_PADDING_PX - FAB_PADDING_PX, 0)
}

function fabPixelFromPosition(
  position: FabPosition,
  viewportWidth: number,
  viewportHeight: number,
  sidebarWidth: number,
): FabPixelPosition {
  const rightEdgeLeft = viewportWidth - FAB_SIZE_PX - FAB_PADDING_PX
  const bottomEdgeTop = viewportHeight - FAB_SIZE_PX - FAB_PADDING_PX
  const alongVertical = FAB_TOP_PADDING_PX + position.offset * verticalRange(viewportHeight)
  const alongHorizontal =
    leftBoundary(sidebarWidth) + position.offset * horizontalRange(viewportWidth, sidebarWidth)

  switch (position.edge) {
    case 'left':
      return { left: leftBoundary(sidebarWidth), top: alongVertical }
    case 'right':
      return { left: rightEdgeLeft, top: alongVertical }
    case 'top':
      return { left: alongHorizontal, top: FAB_TOP_PADDING_PX }
    case 'bottom':
      return { left: alongHorizontal, top: bottomEdgeTop }
  }
}

function nearestEdgePosition(
  pixel: FabPixelPosition,
  viewportWidth: number,
  viewportHeight: number,
  sidebarWidth: number,
): FabPosition {
  // Distances are measured to the usable-area boundaries (past the sidebar and
  // topbar), not the raw viewport edges -- a fab dragged against the sidebar
  // must read as "at the left edge" even though it is hundreds of px from x=0.
  const distances: readonly { readonly edge: FabEdge; readonly distance: number }[] = [
    { edge: 'left', distance: pixel.left - leftBoundary(sidebarWidth) },
    { edge: 'right', distance: viewportWidth - FAB_PADDING_PX - (pixel.left + FAB_SIZE_PX) },
    { edge: 'top', distance: pixel.top - FAB_TOP_PADDING_PX },
    { edge: 'bottom', distance: viewportHeight - FAB_PADDING_PX - (pixel.top + FAB_SIZE_PX) },
  ]
  const nearest = distances.reduce((closest, candidate) =>
    candidate.distance <= closest.distance ? candidate : closest,
  )

  if (nearest.edge === 'left' || nearest.edge === 'right') {
    const range = verticalRange(viewportHeight)
    const offset = range === 0 ? 0 : (pixel.top - FAB_TOP_PADDING_PX) / range
    return { edge: nearest.edge, offset: clamp(offset, MIN_OFFSET, MAX_OFFSET) }
  }
  const range = horizontalRange(viewportWidth, sidebarWidth)
  const offset = range === 0 ? 0 : (pixel.left - leftBoundary(sidebarWidth)) / range
  return { edge: nearest.edge, offset: clamp(offset, MIN_OFFSET, MAX_OFFSET) }
}

function panelStyleFromFab(
  fabPixel: FabPixelPosition,
  viewportWidth: number,
  viewportHeight: number,
  sidebarWidth: number,
): React.CSSProperties {
  const fabCenterX = fabPixel.left + FAB_SIZE_PX * HALF
  const fabCenterY = fabPixel.top + FAB_SIZE_PX * HALF
  const left =
    fabCenterX < viewportWidth * HALF
      ? leftBoundary(sidebarWidth)
      : viewportWidth - PANEL_WIDTH_PX - FAB_PADDING_PX
  const top =
    fabCenterY < viewportHeight * HALF
      ? FAB_TOP_PADDING_PX
      : viewportHeight - PANEL_HEIGHT_PX - FAB_PADDING_PX
  return { position: 'fixed', left, top }
}

function computeDragPixel(
  drag: DragState,
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
  sidebarWidth: number,
): FabPixelPosition {
  const dx = clientX - drag.startX
  const dy = clientY - drag.startY
  const minLeft = leftBoundary(sidebarWidth)
  const maxLeft = Math.max(viewportWidth - FAB_SIZE_PX - FAB_PADDING_PX, minLeft)
  const maxTop = Math.max(viewportHeight - FAB_SIZE_PX - FAB_PADDING_PX, FAB_TOP_PADDING_PX)
  return {
    left: clamp(drag.originLeft + dx, minLeft, maxLeft),
    top: clamp(drag.originTop + dy, FAB_TOP_PADDING_PX, maxTop),
  }
}

function hasExceededDragThreshold(drag: DragState, clientX: number, clientY: number): boolean {
  const dx = clientX - drag.startX
  const dy = clientY - drag.startY
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX
}

export function useFabPosition(): UseFabPositionResult {
  // Initialized to SSR-safe defaults (no browser read) so the first client
  // render matches the server render and React does not report a hydration
  // mismatch; the mount effect below reads localStorage/viewport after mount.
  const [storedPosition, setStoredPosition] = React.useState<FabPosition | null>(null)
  const [viewport, setViewport] = React.useState<ViewportSize>(EMPTY_VIEWPORT)
  const [sidebarWidth, setSidebarWidth] = React.useState(0)
  const [liveDrag, setLiveDrag] = React.useState<FabPixelPosition | null>(null)
  const { width: viewportWidth, height: viewportHeight } = viewport

  const dragRef = React.useRef<DragState | null>(null)
  const pendingConsumeRef = React.useRef(false)

  React.useEffect(() => {
    // Deliberate post-mount browser read. Reading localStorage/viewport during
    // render would diverge from the server render (window is undefined there)
    // and trigger a hydration mismatch that drops the persisted fab position on
    // reload. The single extra render this causes is the accepted one-frame
    // default->stored settle, so the set-state-in-effect guidance is waived here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStoredPosition(readStoredPosition())
    setViewport(readViewportSize())
    setSidebarWidth(readSidebarWidth())
    function handleResize(): void {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      setSidebarWidth(readSidebarWidth())
    }
    window.addEventListener('resize', handleResize)
    // The sidebar collapse toggle animates its width without any window resize,
    // so a parked fab/panel must track the bar itself to slide with it live.
    const aside = document.querySelector(SIDEBAR_SELECTOR)
    let sidebarObserver: ResizeObserver | undefined
    if (aside && typeof ResizeObserver !== 'undefined') {
      sidebarObserver = new ResizeObserver(() => setSidebarWidth(readSidebarWidth()))
      sidebarObserver.observe(aside)
    }
    return () => {
      window.removeEventListener('resize', handleResize)
      sidebarObserver?.disconnect()
    }
  }, [])

  const currentPixel = React.useMemo<FabPixelPosition>(
    () =>
      fabPixelFromPosition(
        storedPosition ?? DEFAULT_POSITION,
        viewportWidth,
        viewportHeight,
        sidebarWidth,
      ),
    [storedPosition, viewportWidth, viewportHeight, sidebarWidth],
  )

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // The sidebar collapses/expands without a window resize, so re-measure it
      // at every drag start; the origin still reads from the pre-measure pixel
      // (where the fab visually sits right now).
      setSidebarWidth(readSidebarWidth())
      // Do NOT capture the pointer here: capturing on pointer-down retargets the
      // synthetic click to this wrapper, so the ChatFab button never receives it
      // and a plain click can no longer open the panel. Capture lazily in the
      // move handler once a genuine drag begins instead.
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originLeft: currentPixel.left,
        originTop: currentPixel.top,
        pointerId: event.pointerId,
        active: false,
      }
    },
    [currentPixel],
  )

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag) return
      if (!drag.active && !hasExceededDragThreshold(drag, event.clientX, event.clientY)) return
      if (!drag.active) {
        // First threshold crossing: acquire capture exactly once so the ensuing
        // move/up stream tracks reliably even outside the element bounds.
        event.currentTarget.setPointerCapture(drag.pointerId)
      }
      drag.active = true
      setLiveDrag(
        computeDragPixel(
          drag,
          event.clientX,
          event.clientY,
          viewportWidth,
          viewportHeight,
          sidebarWidth,
        ),
      )
    },
    [viewportWidth, viewportHeight, sidebarWidth],
  )

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null

      if (drag.active) {
        // Capture was taken only once the drag started, so release only then;
        // a plain click never captured and must not release.
        event.currentTarget.releasePointerCapture(drag.pointerId)
        const pixel = computeDragPixel(
          drag,
          event.clientX,
          event.clientY,
          viewportWidth,
          viewportHeight,
          sidebarWidth,
        )
        const snapped = nearestEdgePosition(pixel, viewportWidth, viewportHeight, sidebarWidth)
        setStoredPosition(snapped)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped))
        pendingConsumeRef.current = true
      }
      setLiveDrag(null)
    },
    [viewportWidth, viewportHeight, sidebarWidth],
  )

  const consumeDrag = React.useCallback((): boolean => {
    if (!pendingConsumeRef.current) return false
    pendingConsumeRef.current = false
    return true
  }, [])

  const fabStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (liveDrag) return { position: 'fixed', left: liveDrag.left, top: liveDrag.top }
    if (!storedPosition) return undefined
    return { position: 'fixed', left: currentPixel.left, top: currentPixel.top }
  }, [liveDrag, storedPosition, currentPixel])

  const panelStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!storedPosition) return undefined
    return panelStyleFromFab(currentPixel, viewportWidth, viewportHeight, sidebarWidth)
  }, [storedPosition, currentPixel, viewportWidth, viewportHeight, sidebarWidth])

  return {
    fabStyle,
    panelStyle,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
    consumeDrag,
  }
}
