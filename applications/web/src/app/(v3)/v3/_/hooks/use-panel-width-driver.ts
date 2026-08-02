"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import {
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
} from "@v3/_/components/ui/page-layout"

const OPEN_CLOSE_DURATION = 240
// close approximation of cubic-bezier(0.22, 1, 0.36, 1)
const easeOut = (p: number) => 1 - Math.pow(1 - p, 5)

// shared timing for the transform slide and the grid's coordinated FLIP
export const PANEL_SLIDE_DURATION = 400
// kind of quick ease out
export const PANEL_SLIDE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)"

export type PanelSlidePhase = "opening" | "closing" | null

const clampWidth = (w: number) =>
  Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, w))

const setBodyDragCursor = (on: boolean) => {
  document.body.style.cursor = on ? "col-resize" : ""
  document.body.style.userSelect = on ? "none" : ""
}

type PanelWidthDriverOptions = {
  open: boolean
  // committed width from the store; the width the panel rests at when open
  storedWidth: number
  animate: boolean
  /* whether the open/close transition slides
   * mostly controlled by user pref
   */
  animateOpenClose?: boolean
  slideMode?: "transform" | "width"
  // this will help animate the things being pushed out of the way
  chromeEl?: React.RefObject<HTMLElement | null>
  // fallback-mode release snap to a whole-column width (grid view only)
  snapOnRelease?: ((raw: number) => number) | undefined
  commit: (width: number) => void
}

/**
 * manually/imperetivaely drive the panel width
 */
export function usePanelWidthDriver({
  open,
  storedWidth: rawStoredWidth,
  animate,
  animateOpenClose = animate,
  slideMode = "width",
  chromeEl,
  snapOnRelease,
  commit,
}: PanelWidthDriverOptions) {
  // in animate mode the driver writes the width to the DOM itself, so a stored
  // value outside the bounds has to be clamped here too
  const storedWidth = clampWidth(rawStoredWidth)

  const panelRef = useRef<HTMLDivElement | null>(null)
  const widthRef = useRef(open ? storedWidth : 0)
  const rafRef = useRef(0)
  // stays true while the close animation runs so content remains mounted
  const [visible, setVisible] = useState(open)
  const [dragging, setDragging] = useState(false)
  // true while the open/close width slide is animating, so the grid can reflow
  // its columns live during the slide (same as a drag) instead of holding the
  // count and squeezing until the width settles.
  const [sliding, setSliding] = useState(false)
  // transform mode: while a phase is active the panel renders as an
  // out-of-flow overlay and translateX does the visual slide.
  const [phase, setPhase] = useState<PanelSlidePhase>(null)
  const slideAnimRef = useRef<Animation | null>(null)
  const revealRafRef = useRef(0)

  const optsRef = useRef({
    storedWidth,
    animate,
    animateOpenClose,
    slideMode,
    chromeEl,
    snapOnRelease,
    commit,
  })
  optsRef.current = {
    storedWidth,
    animate,
    animateOpenClose,
    slideMode,
    chromeEl,
    snapOnRelease,
    commit,
  }

  const setRevealVar = useCallback((px: number) => {
    const el = optsRef.current.chromeEl?.current
    if (el) el.style.setProperty("--panel-reveal", `${Math.max(0, px)}px`)
  }, [])

  const setDom = useCallback((w: number) => {
    widthRef.current = w
    const el = panelRef.current
    if (el) el.style.width = `${w}px`
  }, [])

  // force the panel to be the stored width
  // do not let react have the chance to change it
  useLayoutEffect(() => {
    if (optsRef.current.animate && visible) setDom(widthRef.current)
  })

  const animateTo = useCallback(
    (to: number, done?: () => void) => {
      cancelAnimationFrame(rafRef.current)
      const from = widthRef.current
      const t0 = performance.now()
      setSliding(true)
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / OPEN_CLOSE_DURATION)
        setDom(from + (to - from) * easeOut(p))
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
        else {
          setSliding(false)
          done?.()
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [setDom],
  )

  const prevOpenRef = useRef(open)
  useLayoutEffect(() => {
    if (open === prevOpenRef.current) return
    prevOpenRef.current = open

    const { animate, animateOpenClose, slideMode, storedWidth } =
      optsRef.current
    // instant when animations are off entirely, or when only the open/close
    // slide is disabled (grid FLIP + drag still on). in animate mode the driver
    // owns the width, so the every-commit re-assert above applies it; otherwise
    // PagePanel renders it from the prop.
    if (!animate || !animateOpenClose) {
      slideAnimRef.current?.cancel()
      slideAnimRef.current = null
      setPhase(null)
      widthRef.current = open ? storedWidth : 0
      setVisible(open)
      return
    }
    // slide it in, don't make the width bigger
    if (slideMode === "transform") {
      widthRef.current = storedWidth
      if (open) setVisible(true)
      setPhase(open ? "opening" : "closing")
      return
    }
    if (open) {
      setVisible(true)
      animateTo(storedWidth)
    } else {
      animateTo(0, () => {
        setVisible(false)
      })
    }
  }, [open, animateTo])

  // transform-mode slide: compositor-driven, so a main-thread stall (e.g. the
  // detail content mounting mid-slide) can't drop its frames. runs pre-paint on
  // the commit where the panel entered overlay mode.
  useLayoutEffect(() => {
    if (!phase) return
    const el = panelRef.current
    if (!el) {
      setPhase(null)
      if (phase === "closing") setVisible(false)
      return
    }

    let from = phase === "opening" ? "100%" : "0px"
    const prev = slideAnimRef.current
    if (prev) {
      const t = getComputedStyle(el).transform
      if (t && t !== "none") from = `${new DOMMatrixReadOnly(t).m41}px`
      prev.cancel()
    }

    // closing from rest: the panel just left flex flow, so the chrome regained
    // the full width in this commit. hold it narrow before paint; the sampler
    // below releases it as the panel departs. (skipped on interruption, where
    // the reveal var is already tracking.)
    if (phase === "closing" && !prev) setRevealVar(widthRef.current)

    // mirror the panel's animated position into the chrome var each frame so
    // in-flow chrome tracks the panel edge exactly, including interruptions
    cancelAnimationFrame(revealRafRef.current)
    const sample = () => {
      const t = getComputedStyle(el).transform
      const tx = t && t !== "none" ? new DOMMatrixReadOnly(t).m41 : 0
      setRevealVar(widthRef.current - tx)
      revealRafRef.current = requestAnimationFrame(sample)
    }
    revealRafRef.current = requestAnimationFrame(sample)

    const anim = el.animate(
      [
        { transform: `translateX(${from})` },
        { transform: `translateX(${phase === "opening" ? "0px" : "100%"})` },
      ],
      // forwards keeps the closing panel held off-screen after the animation
      // ends; with the default fill the transform would revert to identity for
      // the frame(s) between finish and React unmounting it (a visible flash)
      {
        duration: PANEL_SLIDE_DURATION,
        easing: PANEL_SLIDE_EASING,
        fill: "forwards",
      },
    )
    slideAnimRef.current = anim
    anim.onfinish = () => {
      if (slideAnimRef.current !== anim) return
      slideAnimRef.current = null
      setPhase(null)
      if (phase === "closing") {
        widthRef.current = 0
        setVisible(false)
      } else {
        // release the fill; the resting transform is identity anyway
        anim.cancel()
      }
    }
  }, [phase, setRevealVar])

  // at rest the chrome width comes from the real layout again (panel in flex
  // or unmounted); reset in the same pre-paint commit as the swap so the
  // handoff is pixel-continuous
  useLayoutEffect(() => {
    if (phase !== null) return
    cancelAnimationFrame(revealRafRef.current)
    setRevealVar(0)
  }, [phase, setRevealVar])

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      cancelAnimationFrame(revealRafRef.current)
      slideAnimRef.current?.cancel()
    },
    [],
  )

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      cancelAnimationFrame(rafRef.current)

      const startX = e.clientX
      const startWidth = widthRef.current
      let raw = startWidth

      setDragging(true)
      setBodyDragCursor(true)

      const handlePointerMove = (ev: PointerEvent) => {
        raw = clampWidth(startWidth + (startX - ev.clientX))
        // pure 1:1 follow; the grid reflows live through its ResizeObserver
        setDom(raw)
      }

      const abortController = new AbortController()
      const handlePointerUp = () => {
        abortController.abort()
        setDragging(false)
        setBodyDragCursor(false)

        const { snapOnRelease, commit } = optsRef.current
        let final = widthRef.current
        if (snapOnRelease) {
          // fallback mode: one reflow to a whole-column width at release
          final = clampWidth(snapOnRelease(raw))
          setDom(final)
        }
        commit(final)
      }

      document.addEventListener("pointermove", handlePointerMove, {
        signal: abortController.signal,
      })
      document.addEventListener("pointerup", handlePointerUp, {
        signal: abortController.signal,
      })
      document.addEventListener("pointercancel", handlePointerUp, {
        signal: abortController.signal,
      })
    },
    [setDom],
  )

  return {
    panelRef,
    visible,
    dragging,
    sliding: sliding || phase !== null,
    phase,
    startDrag,
  }
}
