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
const easeOut = (p: number) => 1 - Math.pow(1 - p, 5)

export const PANEL_SLIDE_DURATION = 400
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
  storedWidth: number
  animate: boolean
  animateOpenClose?: boolean
  slideMode?: "transform" | "width"
  chromeEl?: React.RefObject<HTMLElement | null>
  snapOnRelease?: ((raw: number) => number) | undefined
  commit: (width: number) => void
}

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
  const storedWidth = clampWidth(rawStoredWidth)

  const panelRef = useRef<HTMLDivElement | null>(null)
  const widthRef = useRef(open ? storedWidth : 0)
  const rafRef = useRef(0)
  const [visible, setVisible] = useState(open)
  const [dragging, setDragging] = useState(false)
  const [sliding, setSliding] = useState(false)
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
    if (!animate || !animateOpenClose) {
      slideAnimRef.current?.cancel()
      slideAnimRef.current = null
      setPhase(null)
      widthRef.current = open ? storedWidth : 0
      setVisible(open)
      return
    }
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

    if (phase === "closing" && !prev) setRevealVar(widthRef.current)

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
        anim.cancel()
      }
    }
  }, [phase, setRevealVar])

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
