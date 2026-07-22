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
const HALF = 0.5
const SIDEBAR_SELECTOR = 'aside[aria-label="Main sidebar"]'
// The snap glide can span up to a full viewport, so it errs toward the slow
// end of a "spatial move" (300-450ms) to read as an intentional lock-in
// rather than a snap-jitter.
export const SNAP_TRANSITION_MS = 380
const SNAP_TRANSITION_EASE = 'ease-out'
const SNAP_TRANSITION = `left ${SNAP_TRANSITION_MS}ms ${SNAP_TRANSITION_EASE}, top ${SNAP_TRANSITION_MS}ms ${SNAP_TRANSITION_EASE}`
// Value parity with the lib ChatFab fixed variant's Tailwind `z-30` -- the
// custom-positioned fab renders `static` inside this hook's own wrapper div
// (no lib class), so without an explicit zIndex it falls to `auto` and
// WeekCalendarView's `z-10` sleep shading paints over it.
export const FAB_Z_INDEX = 30

export type FabCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface FabPosition {
  readonly corner: FabCorner
}

// Pre-corner-snap stored shape (fab dragged anywhere along one full viewport
// edge). Still accepted on read so a value persisted before this model
// migrates instead of silently reverting to the default.
type LegacyFabEdge = 'left' | 'right' | 'top' | 'bottom'

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

const VALID_CORNERS: readonly FabCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const VALID_LEGACY_EDGES: readonly LegacyFabEdge[] = ['left', 'right', 'top', 'bottom']
const DEFAULT_POSITION: FabPosition = { corner: 'bottom-right' }

function isFabCorner(value: unknown): value is FabCorner {
  return typeof value === 'string' && (VALID_CORNERS as readonly string[]).includes(value)
}

function isLegacyFabEdge(value: unknown): value is LegacyFabEdge {
  return typeof value === 'string' && (VALID_LEGACY_EDGES as readonly string[]).includes(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Maps a legacy {edge, offset} position to the corner it visually occupied,
// so a value persisted before the corner-snap model still restores near the
// same spot instead of silently reverting to the default.
function cornerFromLegacyEdge(edge: LegacyFabEdge, offset: number): FabCorner {
  const isNearStart = offset < HALF
  switch (edge) {
    case 'left':
      return isNearStart ? 'top-left' : 'bottom-left'
    case 'right':
      return isNearStart ? 'top-right' : 'bottom-right'
    case 'top':
      return isNearStart ? 'top-left' : 'top-right'
    case 'bottom':
      return isNearStart ? 'bottom-left' : 'bottom-right'
  }
}

function parseStoredPosition(raw: string | null): FabPosition | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as { corner?: unknown; edge?: unknown; offset?: unknown }
    if (isFabCorner(candidate.corner)) return { corner: candidate.corner }
    if (
      isLegacyFabEdge(candidate.edge) &&
      typeof candidate.offset === 'number' &&
      Number.isFinite(candidate.offset)
    ) {
      return { corner: cornerFromLegacyEdge(candidate.edge, candidate.offset) }
    }
    return null
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

// Read only from the release event handler, never during render -- same
// SSR-safe discipline as the other window reads above. A missing matchMedia
// implementation (older browsers) degrades to "no reduced-motion preference"
// rather than throwing; happy-dom always implements matchMedia as a function,
// so that half of the guard is not exercisable in the test environment --
// accepted per-line branch coverage gap, same class as the other SSR guards.
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Left travel limit: the fab/panel stops just clear of the sidebar, never on it.
function leftBoundary(sidebarWidth: number): number {
  return sidebarWidth + BAR_GAP_PX
}

function fabPixelFromCorner(
  corner: FabCorner,
  viewportWidth: number,
  viewportHeight: number,
  sidebarWidth: number,
): FabPixelPosition {
  const rightEdgeLeft = viewportWidth - FAB_SIZE_PX - FAB_PADDING_PX
  const bottomEdgeTop = viewportHeight - FAB_SIZE_PX - FAB_PADDING_PX
  switch (corner) {
    case 'top-left':
      return { left: leftBoundary(sidebarWidth), top: FAB_TOP_PADDING_PX }
    case 'top-right':
      return { left: rightEdgeLeft, top: FAB_TOP_PADDING_PX }
    case 'bottom-left':
      return { left: leftBoundary(sidebarWidth), top: bottomEdgeTop }
    case 'bottom-right':
      return { left: rightEdgeLeft, top: bottomEdgeTop }
  }
}

interface FabCenterPoint {
  readonly x: number
  readonly y: number
}

function centerOfPixel(pixel: FabPixelPosition): FabCenterPoint {
  return { x: pixel.left + FAB_SIZE_PX * HALF, y: pixel.top + FAB_SIZE_PX * HALF }
}

// Distance is measured between fab CENTERS (the dragged pixel's center vs.
// each usable-area corner's resting center), so a corner is picked by where
// the fab visually is, not by its raw top-left coordinate.
function nearestCorner(
  pixel: FabPixelPosition,
  viewportWidth: number,
  viewportHeight: number,
  sidebarWidth: number,
): FabCorner {
  const center = centerOfPixel(pixel)
  const distances: readonly { readonly corner: FabCorner; readonly distance: number }[] =
    VALID_CORNERS.map((corner) => {
      const cornerCenter = centerOfPixel(
        fabPixelFromCorner(corner, viewportWidth, viewportHeight, sidebarWidth),
      )
      return {
        corner,
        distance: Math.hypot(center.x - cornerCenter.x, center.y - cornerCenter.y),
      }
    })
  // Ties break to the earlier VALID_CORNERS entry: strict `<` keeps the
  // current closest when distances are equal (first-wins, deterministic).
  return distances.reduce((closest, candidate) =>
    candidate.distance < closest.distance ? candidate : closest,
  ).corner
}

function panelStyleFromCorner(
  corner: FabCorner,
  viewportWidth: number,
  viewportHeight: number,
  sidebarWidth: number,
): React.CSSProperties {
  const left =
    corner === 'top-left' || corner === 'bottom-left'
      ? leftBoundary(sidebarWidth)
      : viewportWidth - PANEL_WIDTH_PX - FAB_PADDING_PX
  const top =
    corner === 'top-left' || corner === 'top-right'
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
  // True only while the post-release glide into the snapped corner is
  // playing; gates the CSS `transition` on fabStyle. Never true on the
  // hydration/mount render -- only handlePointerUp sets it.
  const [isSettling, setIsSettling] = React.useState(false)
  const { width: viewportWidth, height: viewportHeight } = viewport

  const dragRef = React.useRef<DragState | null>(null)
  const pendingConsumeRef = React.useRef(false)
  const settleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (settleTimeoutRef.current !== null) clearTimeout(settleTimeoutRef.current)
    }
  }, [])

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
      fabPixelFromCorner(
        (storedPosition ?? DEFAULT_POSITION).corner,
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
      // A fresh press means any prior drag's consume window is over: on a
      // real drag, pointer capture is held by this wrapper, so the browser's
      // post-release click retargets to the wrapper (common ancestor of the
      // pointerdown target [ChatFab button] and the capture element) instead
      // of reaching the button -- consumeDrag() is then never called, and the
      // stale `true` flag silently swallows the NEXT genuine click. DOM event
      // order (pointerdown -> pointerup -> click) guarantees this reset can
      // never race the SAME interaction's own click, and the drag-release
      // path below re-sets the flag AFTER this reset runs (on the following
      // press), so release-click gating is unaffected.
      pendingConsumeRef.current = false
      // Grabbing the fab again mid-glide cancels the in-flight settle
      // animation immediately, so the drag resumes from a non-transitioning
      // style (matches requirement: no transition while dragging).
      if (settleTimeoutRef.current !== null) {
        clearTimeout(settleTimeoutRef.current)
        settleTimeoutRef.current = null
      }
      setIsSettling(false)
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
        const snapped = nearestCorner(pixel, viewportWidth, viewportHeight, sidebarWidth)
        const nextPosition: FabPosition = { corner: snapped }
        setStoredPosition(nextPosition)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPosition))
        pendingConsumeRef.current = true

        // No stale timeout to clear here: handlePointerDown already clears any
        // pending settle timeout at the start of every new drag, and dragRef
        // being reset to null at the top of this handler makes a second
        // handlePointerUp call (without an intervening pointerDown) a no-op.
        if (prefersReducedMotion()) {
          // Reduced motion: keep today's instant-snap behavior.
          setIsSettling(false)
        } else {
          setIsSettling(true)
          // happy-dom (and older browsers) never fire `transitionend`, so the
          // settle window is cleared by a timeout matched to the CSS
          // transition duration rather than a DOM listener.
          settleTimeoutRef.current = setTimeout(() => {
            setIsSettling(false)
            settleTimeoutRef.current = null
          }, SNAP_TRANSITION_MS)
        }
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
    // Mid-drag: track the pointer 1:1, no transition -- a live drag always
    // wins over isSettling (a fresh grab already clears isSettling in
    // handlePointerDown, but this keeps the invariant structural too). Both
    // branches carry FAB_Z_INDEX so a custom-positioned fab never dips under
    // the calendar's sleep shading, dragging included.
    if (liveDrag) {
      return { position: 'fixed', left: liveDrag.left, top: liveDrag.top, zIndex: FAB_Z_INDEX }
    }
    if (!storedPosition) return undefined
    const settled: React.CSSProperties = {
      position: 'fixed',
      left: currentPixel.left,
      top: currentPixel.top,
      zIndex: FAB_Z_INDEX,
    }
    return isSettling ? { ...settled, transition: SNAP_TRANSITION } : settled
  }, [liveDrag, storedPosition, currentPixel, isSettling])

  const panelStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!storedPosition) return undefined
    return panelStyleFromCorner(storedPosition.corner, viewportWidth, viewportHeight, sidebarWidth)
  }, [storedPosition, viewportWidth, viewportHeight, sidebarWidth])

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
