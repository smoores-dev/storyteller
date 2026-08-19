"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { flushSync } from "react-dom"

const DEFAULT_OVERSCAN_ROWS = 4
const DEFAULT_FLIP_DURATION = 320
const LIVE_RESIZE_FLIP_DURATION = 540
const DEFAULT_FLIP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)"
const DEFAULT_FETCH_AHEAD_ROWS = 3
const DEFAULT_PAUSE_TAIL_ROWS = 6
const RESIZE_SETTLE_MS = 120

export type VirtualGridGeometry = {
  minColumnWidth: number
  gapX: number
  gapY: number
  padX: number
  padY: number
  rowHeightForColumnWidth: (columnWidth: number) => number
  fixedColumns?: number
}

export type Metrics = {
  cols: number
  colWidth: number
  rowHeight: number
  step: number
}

type RowRange = { firstRow: number; lastRow: number }

export type UseVirtualGridOptions = {
  itemCount: number
  geometry: VirtualGridGeometry
  overscanRows?: number

  getScrollElement?: (sizer: HTMLElement) => HTMLElement | null

  anchorIndex?: number | null

  animate?: boolean
  reducedMotion?: boolean
  flipDuration?: number
  flipEasing?: string
  liveResize?: boolean
  pendingWidthDelta?: number

  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  onFetchNextPage?: () => void
  fetchAheadRows?: number

  deferCoverLoads?: boolean
  pauseTailRows?: number
}

export type VirtualGrid = {
  sizerRef: (node: HTMLDivElement | null) => void
  gridRef: React.RefObject<HTMLDivElement | null>
  sizerStyle: React.CSSProperties
  gridStyle: React.CSSProperties
  metrics: Metrics
  range: RowRange
  startIndex: number
  endIndex: number
  totalHeight: number
  imagesActive: boolean
  scrollToIndex: (index: number) => void
}

function defaultFindScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null
  while (el) {
    const overflowY = getComputedStyle(el).overflowY
    if (overflowY === "auto" || overflowY === "scroll") return el
    el = el.parentElement
  }
  return null
}

function metricsFor(
  width: number,
  g: VirtualGridGeometry,
  itemCount = Infinity,
): Metrics {
  const inner = Math.max(0, width - g.padX)
  const cols =
    g.fixedColumns ??
    Math.max(1, Math.floor((inner + g.gapX) / (g.minColumnWidth + g.gapX)))
  return metricsForColumns(width, g, cols, itemCount)
}

function metricsForColumns(
  width: number,
  g: VirtualGridGeometry,
  cols: number,
  itemCount = Infinity,
): Metrics {
  const inner = Math.max(0, width - g.padX)
  const safeCols = Math.max(1, cols)
  let colWidth = Math.max(0, (inner - g.gapX * (safeCols - 1)) / safeCols)
  if (itemCount < safeCols) colWidth = Math.min(colWidth, g.minColumnWidth)
  const rowHeight = g.rowHeightForColumnWidth(colWidth)
  return { cols: safeCols, colWidth, rowHeight, step: rowHeight + g.gapY }
}

function totalHeightFor(
  count: number,
  m: Metrics,
  g: VirtualGridGeometry,
): number {
  const rows = m.cols > 0 ? Math.ceil(count / m.cols) : 0
  if (rows === 0) return 0
  return g.padY * 2 + rows * m.rowHeight + (rows - 1) * g.gapY
}

function rowTop(
  row: number,
  m: Metrics,
  g: VirtualGridGeometry,
  containerTop: number,
) {
  return containerTop + g.padY + row * m.step
}

function computeRange(
  scrollTop: number,
  viewportHeight: number,
  containerTop: number,
  m: Metrics,
  g: VirtualGridGeometry,
  rowCount: number,
  overscan: number,
): RowRange {
  const top = scrollTop - containerTop - g.padY
  const firstRow = Math.max(0, Math.floor(top / m.step) - overscan)
  const lastRow = Math.min(
    Math.max(0, rowCount - 1),
    Math.floor((top + viewportHeight) / m.step) + overscan,
  )
  return { firstRow, lastRow }
}

function cellViewport(
  index: number,
  m: Metrics,
  g: VirtualGridGeometry,
  containerTop: number,
  scrollTop: number,
) {
  const col = index % m.cols
  const row = Math.floor(index / m.cols)
  return {
    left: g.padX / 2 + col * (m.colWidth + g.gapX),
    top: rowTop(row, m, g, containerTop) - scrollTop,
  }
}

export function useVirtualGrid(options: UseVirtualGridOptions): VirtualGrid {
  const {
    itemCount,
    geometry,
    overscanRows = DEFAULT_OVERSCAN_ROWS,
    getScrollElement = defaultFindScrollParent,
    anchorIndex = null,
    animate = false,
    reducedMotion = false,
    flipDuration = DEFAULT_FLIP_DURATION,
    flipEasing = DEFAULT_FLIP_EASING,
    hasNextPage = false,
    isFetchingNextPage = false,
    onFetchNextPage,
    fetchAheadRows = DEFAULT_FETCH_AHEAD_ROWS,
    deferCoverLoads = false,
    pauseTailRows = DEFAULT_PAUSE_TAIL_ROWS,
    liveResize = false,
    pendingWidthDelta = 0,
  } = options

  const sizerElRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const scrollElRef = useRef<HTMLElement | null>(null)

  const widthRef = useRef(0)
  const scrollTopRef = useRef(0)
  const containerTopRef = useRef(0)
  const prevScrollRef = useRef(0)
  const appliedColsRef = useRef(0)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const resizingRef = useRef(false)
  const flipAnims = useRef(new Map<Element, Animation>())
  const scrollRaf = useRef(0)
  const scrollIdle = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const roRef = useRef<ResizeObserver | null>(null)

  const geometryRef = useRef(geometry)
  geometryRef.current = geometry
  const itemCountRef = useRef(itemCount)
  itemCountRef.current = itemCount
  const anchorIndexRef = useRef(anchorIndex)
  anchorIndexRef.current = anchorIndex
  const overscanRef = useRef(overscanRows)
  overscanRef.current = overscanRows
  const deferRef = useRef(deferCoverLoads)
  const hasNextRef = useRef(hasNextPage)
  const fetchingRef = useRef(isFetchingNextPage)
  const pauseTailRef = useRef(pauseTailRows)
  pauseTailRef.current = pauseTailRows
  const animateRef = useRef(animate)
  animateRef.current = animate
  const reducedRef = useRef(reducedMotion)
  reducedRef.current = reducedMotion
  const flipDurationRef = useRef(flipDuration)
  flipDurationRef.current = flipDuration
  const flipEasingRef = useRef(flipEasing)
  flipEasingRef.current = flipEasing
  const liveResizeRef = useRef(liveResize)
  liveResizeRef.current = liveResize

  const [metrics, setMetricsState] = useState<Metrics>({
    cols: 0,
    colWidth: 0,
    rowHeight: 0,
    step: 0,
  })
  const [range, setRange] = useState<RowRange>({ firstRow: 0, lastRow: 0 })
  const rangeRef = useRef(range)
  rangeRef.current = range
  const [imagesActive, setImagesActive] = useState(true)
  const imagesActiveRef = useRef(true)

  const setImages = useCallback((active: boolean) => {
    if (imagesActiveRef.current === active) return
    imagesActiveRef.current = active
    setImagesActive(active)
  }, [])

  const setMetricsIfChanged = useCallback((next: Metrics) => {
    setMetricsState((prev) => (prev.cols === next.cols ? prev : next))
  }, [])

  useEffect(() => {
    hasNextRef.current = hasNextPage
    fetchingRef.current = isFetchingNextPage
  }, [hasNextPage, isFetchingNextPage])

  useEffect(() => {
    deferRef.current = deferCoverLoads
    if (!deferCoverLoads) setImages(true)
  }, [deferCoverLoads, setImages])

  const m = metrics
  const startIndex = range.firstRow * m.cols
  const endIndex = Math.min(itemCount, (range.lastRow + 1) * m.cols)
  const totalHeight = totalHeightFor(itemCount, m, geometry)

  const measureContainerTop = useCallback(() => {
    const sizer = sizerElRef.current
    const scroller = scrollElRef.current
    if (!sizer || !scroller) return 0
    return (
      sizer.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop
    )
  }, [])

  const syncGridStyles = useCallback(() => {
    const grid = gridRef.current
    const sizer = sizerElRef.current
    if (!grid || !sizer) return
    const g = geometryRef.current
    const n = itemCountRef.current
    const cols = appliedColsRef.current || metricsFor(widthRef.current, g).cols
    const mm = metricsForColumns(widthRef.current, g, cols, n)

    // eslint-disable-next-line react-compiler/react-compiler
    sizer.style.height = `${totalHeightFor(n, mm, g)}px`
    grid.style.gridTemplateColumns = `repeat(${cols}, ${mm.colWidth}px)`
    grid.style.gridAutoRows = `${mm.rowHeight}px`
    grid.style.transform = `translateY(${
      g.padY + rangeRef.current.firstRow * mm.step
    }px)`
  }, [])

  const updateRange = useCallback(
    (growOnly?: boolean) => {
      const scroller = scrollElRef.current
      if (!scroller) return undefined
      const g = geometryRef.current
      const cols =
        appliedColsRef.current || metricsFor(widthRef.current, g).cols
      const mm = metricsForColumns(
        widthRef.current,
        g,
        cols,
        itemCountRef.current,
      )
      const containerTop = measureContainerTop()
      containerTopRef.current = containerTop
      const rc = mm.cols > 0 ? Math.ceil(itemCountRef.current / mm.cols) : 0
      const desired = computeRange(
        scrollTopRef.current,
        scroller.clientHeight,
        containerTop,
        mm,
        g,
        rc,
        overscanRef.current,
      )
      setRange((prev) => {
        const next = growOnly
          ? {
              firstRow: Math.min(prev.firstRow, desired.firstRow),
              lastRow: Math.max(prev.lastRow, desired.lastRow),
            }
          : desired
        return prev.firstRow === next.firstRow && prev.lastRow === next.lastRow
          ? prev
          : next
      })
      return desired
    },
    [measureContainerTop],
  )

  const playFlip = useCallback(
    (
      oldM: Metrics,
      newM: Metrics,
      containerTop: number,
      oldScrollTop: number,
      newScrollTop: number,
    ) => {
      if (!animateRef.current || reducedRef.current) return
      const grid = gridRef.current
      if (!grid || oldM.cols === 0) return
      const g = geometryRef.current
      const duration = liveResizeRef.current
        ? Math.min(flipDurationRef.current, LIVE_RESIZE_FLIP_DURATION)
        : flipDurationRef.current
      const nodes = grid.querySelectorAll<HTMLElement>("[data-index]")
      for (const node of nodes) {
        const index = Number(node.dataset["index"])
        const from = cellViewport(index, oldM, g, containerTop, oldScrollTop)
        const to = cellViewport(index, newM, g, containerTop, newScrollTop)
        const dx = from.left - to.left
        const dy = from.top - to.top
        if (Math.abs(dx) + Math.abs(dy) < 1) continue

        flipAnims.current.get(node)?.cancel()
        const anim = node.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration, easing: flipEasingRef.current },
        )
        flipAnims.current.set(node, anim)
        const done = () => {
          if (flipAnims.current.get(node) === anim)
            flipAnims.current.delete(node)
        }
        anim.onfinish = done
        anim.oncancel = done
      }
    },
    [],
  )

  const rowCount = m.cols > 0 ? Math.ceil(itemCount / m.cols) : 0
  useEffect(() => {
    if (
      onFetchNextPage &&
      hasNextPage &&
      !isFetchingNextPage &&
      rowCount > 0 &&
      range.lastRow >= rowCount - fetchAheadRows
    ) {
      onFetchNextPage()
    }
  }, [
    range.lastRow,
    rowCount,
    hasNextPage,
    isFetchingNextPage,
    onFetchNextPage,
    fetchAheadRows,
  ])

  const onScroll = useCallback(() => {
    const scroller = scrollElRef.current
    if (!scroller) return
    scrollTopRef.current = scroller.scrollTop

    const grid = gridRef.current
    if (grid) {
      // eslint-disable-next-line react-compiler/react-compiler
      grid.style.pointerEvents = "none"
    }
    clearTimeout(scrollIdle.current)
    scrollIdle.current = setTimeout(() => {
      if (gridRef.current) gridRef.current.style.pointerEvents = ""
      setImages(true)
    }, 150)

    if (scrollRaf.current) return
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0
      const desired = updateRange()
      if (!desired) return
      const g = geometryRef.current
      const mm = metricsFor(widthRef.current, g, itemCountRef.current)
      const rc = mm.cols > 0 ? Math.ceil(itemCountRef.current / mm.cols) : 0

      const goingDown = scrollTopRef.current > prevScrollRef.current
      prevScrollRef.current = scrollTopRef.current
      const nearTail = desired.lastRow >= rc - pauseTailRef.current
      const competing = hasNextRef.current && (fetchingRef.current || nearTail)
      setImages(!(deferRef.current && goingDown && competing))
    })
  }, [updateRange, setImages])

  const scrollToIndex = useCallback(
    (index: number) => {
      const scroller = scrollElRef.current
      if (!scroller) return
      const g = geometryRef.current
      const mm = metricsFor(widthRef.current, g, itemCountRef.current)
      if (mm.cols === 0) return
      const containerTop = measureContainerTop()
      const top = rowTop(Math.floor(index / mm.cols), mm, g, containerTop)
      const bottom = top + mm.rowHeight
      const viewTop = scroller.scrollTop
      const viewBottom = viewTop + scroller.clientHeight
      // eslint-disable-next-line react-compiler/react-compiler
      if (top < viewTop + g.padY) scroller.scrollTop = Math.max(0, top - g.padY)
      else if (bottom > viewBottom - g.padY)
        scroller.scrollTop = bottom - scroller.clientHeight + g.padY
    },
    [measureContainerTop],
  )

  const anchorScroll = useCallback(
    (oldM: Metrics, newM: Metrics) => {
      const scroller = scrollElRef.current
      const sizer = sizerElRef.current
      const g = geometryRef.current
      const containerTop = measureContainerTop()
      containerTopRef.current = containerTop
      const oldScrollTop = scroller?.scrollTop ?? 0
      let newScrollTop = oldScrollTop
      if (scroller && sizer) {
        const index = pickAnchorIndex(
          oldM,
          g,
          containerTop,
          oldScrollTop,
          scroller.clientHeight,
          itemCountRef.current,
          anchorIndexRef.current,
        )
        if (index >= 0) {
          const offset =
            rowTop(Math.floor(index / oldM.cols), oldM, g, containerTop) -
            oldScrollTop
          const newTop = rowTop(
            Math.floor(index / newM.cols),
            newM,
            g,
            containerTop,
          )
          sizer.style.height = `${totalHeightFor(itemCountRef.current, newM, g)}px`
          const maxScroll = Math.max(
            0,
            scroller.scrollHeight - scroller.clientHeight,
          )
          newScrollTop = Math.max(0, Math.min(maxScroll, newTop - offset))
          scroller.scrollTop = newScrollTop
          scrollTopRef.current = newScrollTop
        }
      }
      return { containerTop, oldScrollTop, newScrollTop }
    },
    [measureContainerTop],
  )

  const commitColumns = useCallback(
    (oldM: Metrics, newM: Metrics) => {
      const scroller = scrollElRef.current
      const sizer = sizerElRef.current
      const g = geometryRef.current
      const containerTop = measureContainerTop()
      containerTopRef.current = containerTop
      const oldScrollTop = scroller?.scrollTop ?? 0
      let newScrollTop = oldScrollTop

      if (scroller && sizer) {
        const index = pickAnchorIndex(
          oldM,
          g,
          containerTop,
          oldScrollTop,
          scroller.clientHeight,
          itemCountRef.current,
          anchorIndexRef.current,
        )
        // eslint-disable-next-line react-compiler/react-compiler
        sizer.style.height = `${totalHeightFor(itemCountRef.current, newM, g)}px`
        if (index >= 0) {
          const offset =
            rowTop(Math.floor(index / oldM.cols), oldM, g, containerTop) -
            oldScrollTop
          const newTop = rowTop(
            Math.floor(index / newM.cols),
            newM,
            g,
            containerTop,
          )
          const maxScroll = Math.max(
            0,
            scroller.scrollHeight - scroller.clientHeight,
          )
          newScrollTop = Math.max(0, Math.min(maxScroll, newTop - offset))
        }
      }

      const clientHeight = scroller?.clientHeight ?? 0
      const rc = newM.cols > 0 ? Math.ceil(itemCountRef.current / newM.cols) : 0
      const newRange = computeRange(
        newScrollTop,
        clientHeight,
        containerTop,
        newM,
        g,
        rc,
        overscanRef.current,
      )

      flushSync(() => {
        appliedColsRef.current = newM.cols
        scrollTopRef.current = newScrollTop
        setMetricsState(newM)
        setRange(newRange)
      })
      if (scroller) scroller.scrollTop = newScrollTop
      playFlip(oldM, newM, containerTop, oldScrollTop, newScrollTop)
    },
    [measureContainerTop, playFlip],
  )

  const pendingDeltaRef = useRef(pendingWidthDelta)
  useLayoutEffect(() => {
    if (pendingWidthDelta === pendingDeltaRef.current) return
    pendingDeltaRef.current = pendingWidthDelta
    const id = requestAnimationFrame(() => {
      const sizer = sizerElRef.current
      if (!sizer) return
      const g = geometryRef.current
      const target = Math.max(0, sizer.clientWidth + pendingDeltaRef.current)
      const prevWidth = widthRef.current
      if (target === prevWidth) return
      const applied = appliedColsRef.current || metricsFor(prevWidth, g).cols
      widthRef.current = target
      commitColumns(
        metricsForColumns(prevWidth, g, applied, itemCountRef.current),
        metricsFor(target, g, itemCountRef.current),
      )
    })
    return () => {
      cancelAnimationFrame(id)
    }
  }, [pendingWidthDelta, commitColumns])

  const reflowColumns = useCallback(
    (basisWidth: number) => {
      const g = geometryRef.current
      const width = widthRef.current
      const applied = appliedColsRef.current
      if (applied === 0) return
      const target = metricsFor(width, g).cols
      if (target === applied) return
      commitColumns(
        metricsForColumns(basisWidth, g, applied, itemCountRef.current),
        metricsFor(width, g, itemCountRef.current),
      )
    },
    [commitColumns],
  )

  const endResize = useCallback(() => {
    resizingRef.current = false
    const grid = gridRef.current
    // eslint-disable-next-line react-compiler/react-compiler
    if (grid) grid.style.pointerEvents = ""
    reflowColumns(widthRef.current)
    updateRange()
  }, [reflowColumns, updateRange])

  const handleResize = useCallback(() => {
    const sizer = sizerElRef.current
    if (!sizer) return
    const g = geometryRef.current
    const width = Math.max(0, sizer.clientWidth + pendingDeltaRef.current)
    const prevWidth = widthRef.current

    if (prevWidth === 0) {
      widthRef.current = width
      appliedColsRef.current = metricsFor(width, g).cols
      syncGridStyles()
      setMetricsIfChanged(
        metricsForColumns(
          width,
          g,
          appliedColsRef.current,
          itemCountRef.current,
        ),
      )
      updateRange()
      return
    }

    if (width === prevWidth) {
      syncGridStyles()
      updateRange()
      return
    }

    const grid = gridRef.current
    if (grid && !resizingRef.current) {
      resizingRef.current = true
      // eslint-disable-next-line react-compiler/react-compiler
      grid.style.pointerEvents = "none"
    }
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(endResize, RESIZE_SETTLE_MS)

    const applied = appliedColsRef.current || metricsFor(prevWidth, g).cols
    appliedColsRef.current = applied

    if (liveResizeRef.current || !animateRef.current) {
      widthRef.current = width
      const n = itemCountRef.current
      const target = metricsFor(width, g).cols
      const oldM = metricsForColumns(prevWidth, g, applied, n)
      if (target === applied) {
        anchorScroll(oldM, metricsForColumns(width, g, applied, n))
        syncGridStyles()
        updateRange(true)
      } else {
        commitColumns(oldM, metricsFor(width, g, n))
      }
      return
    }

    widthRef.current = width
    anchorScroll(
      metricsForColumns(prevWidth, g, applied, itemCountRef.current),
      metricsForColumns(width, g, applied, itemCountRef.current),
    )
    syncGridStyles()
    updateRange(true)
  }, [
    syncGridStyles,
    updateRange,
    setMetricsIfChanged,
    anchorScroll,
    commitColumns,
    endResize,
  ])

  const sizerRef = useCallback(
    (node: HTMLDivElement | null) => {
      sizerElRef.current = node

      const prevScroller = scrollElRef.current
      if (prevScroller) prevScroller.removeEventListener("scroll", onScroll)
      roRef.current?.disconnect()
      roRef.current = null

      if (!node) {
        scrollElRef.current = null
        return
      }

      const scroller = getScrollElement(node) ?? node
      scrollElRef.current = scroller
      scroller.addEventListener("scroll", onScroll, { passive: true })
      scrollTopRef.current = scroller.scrollTop
      containerTopRef.current = measureContainerTop()

      const ro = new ResizeObserver(handleResize)
      ro.observe(scroller)
      roRef.current = ro

      widthRef.current = node.clientWidth
      appliedColsRef.current = metricsFor(
        node.clientWidth,
        geometryRef.current,
      ).cols
      setMetricsIfChanged(
        metricsForColumns(
          node.clientWidth,
          geometryRef.current,
          appliedColsRef.current,
          itemCountRef.current,
        ),
      )
      updateRange()
    },
    [
      getScrollElement,
      onScroll,
      measureContainerTop,
      handleResize,
      updateRange,
      setMetricsIfChanged,
    ],
  )

  useLayoutEffect(() => {
    syncGridStyles()
  }, [metrics, range, itemCount, geometry, syncGridStyles])

  useLayoutEffect(() => {
    appliedColsRef.current = metricsFor(widthRef.current, geometry).cols
    setMetricsIfChanged(
      metricsForColumns(
        widthRef.current,
        geometry,
        appliedColsRef.current,
        itemCount,
      ),
    )
    updateRange()
  }, [itemCount, geometry, updateRange, setMetricsIfChanged])

  useEffect(() => {
    const anims = flipAnims.current
    return () => {
      clearTimeout(settleTimer.current)
      for (const anim of anims.values()) anim.cancel()
      anims.clear()
    }
  }, [])

  const sizerStyle: React.CSSProperties = {
    position: "relative",
  }
  const gridStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    boxSizing: "border-box",
    paddingLeft: geometry.padX / 2,
    paddingRight: geometry.padX / 2,
    display: "grid",
    columnGap: geometry.gapX,
    rowGap: geometry.gapY,
  }

  return {
    sizerRef,
    gridRef,
    sizerStyle,
    gridStyle,
    metrics: m,
    range,
    startIndex,
    endIndex,
    totalHeight,
    imagesActive,
    scrollToIndex,
  }
}

function pickAnchorIndex(
  m: Metrics,
  g: VirtualGridGeometry,
  containerTop: number,
  scrollTop: number,
  viewportHeight: number,
  count: number,
  preferred: number | null,
): number {
  if (count === 0 || m.cols === 0) return -1

  if (preferred != null && preferred >= 0 && preferred < count) {
    const top = rowTop(Math.floor(preferred / m.cols), m, g, containerTop)
    if (top + m.rowHeight > scrollTop && top < scrollTop + viewportHeight) {
      return preferred
    }
  }

  const topRow = Math.max(
    0,
    Math.floor((scrollTop - containerTop - g.padY) / m.step),
  )
  return Math.min(count - 1, topRow * m.cols)
}
