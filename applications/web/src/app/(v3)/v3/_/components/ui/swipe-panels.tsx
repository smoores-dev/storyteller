"use client"

import {
  type PanInfo,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from "motion/react"
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"

import { cn } from "@v3/_/lib/utils"

const SPRING = { type: "spring", stiffness: 380, damping: 38 } as const
const INSTANT = { duration: 0 } as const
const SWIPE_FRACTION = 0.2
const VELOCITY_WEIGHT = 0.2

const claimedPointers = new WeakSet<Event>()

export type SwipePanel<Value extends string> = {
  value: Value
  content: ReactNode
}

export function SwipePanels<Value extends string>({
  value,
  onValueChange,
  panels,
  lazy = false,
  className,
}: {
  value: Value
  onValueChange: (value: Value) => void
  panels: SwipePanel<Value>[]
  lazy?: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const settledWidth = useRef(0)
  const [width, setWidth] = useState(0)
  const [visited, setVisited] = useState<ReadonlySet<Value>>(
    () => new Set([value]),
  )
  const x = useMotionValue(0)
  const dragControls = useDragControls()

  const index = Math.max(
    0,
    panels.findIndex((panel) => panel.value === value),
  )
  const swipeable = panels.length > 1

  if (!visited.has(value)) {
    setVisited(new Set([...visited, value]))
  }

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const target = -index * width
    if (settledWidth.current !== width) {
      settledWidth.current = width
      x.set(target)
      return
    }
    const animation = animate(x, target, reduceMotion ? INSTANT : SPRING)
    return () => {
      animation.stop()
    }
  }, [index, reduceMotion, width, x])

  const startSwipe = (event: PointerEvent<HTMLDivElement>) => {
    if (!swipeable || event.pointerType !== "touch") return
    if (claimedPointers.has(event.nativeEvent)) return
    if (
      event.target instanceof Element &&
      event.target.closest("[data-no-swipe]")
    ) {
      return
    }
    claimedPointers.add(event.nativeEvent)
    dragControls.start(event)
  }

  const endSwipe = (_event: unknown, info: PanInfo) => {
    const travel = info.offset.x + info.velocity.x * VELOCITY_WEIGHT
    const threshold = width * SWIPE_FRACTION
    const next =
      travel < -threshold
        ? Math.min(index + 1, panels.length - 1)
        : travel > threshold
          ? Math.max(index - 1, 0)
          : index
    const target = panels[next]
    if (next !== index && target) {
      onValueChange(target.value)
      return
    }
    animate(x, -index * width, reduceMotion ? INSTANT : SPRING)
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={startSwipe}
      className={cn("min-h-0 overflow-hidden", className)}
      style={{ touchAction: swipeable ? "pan-y" : undefined }}
    >
      <motion.div
        className="flex h-full"
        style={{ x }}
        drag={swipeable ? "x" : false}
        dragControls={dragControls}
        dragListener={false}
        dragDirectionLock
        dragMomentum={false}
        dragElastic={0.12}
        dragConstraints={{ left: -(panels.length - 1) * width, right: 0 }}
        onDragEnd={endSwipe}
      >
        {panels.map((panel, panelIndex) => (
          <div
            key={panel.value}
            inert={panelIndex !== index}
            className="flex h-full min-h-0 w-full shrink-0 flex-col"
          >
            {(!lazy || visited.has(panel.value)) && panel.content}
          </div>
        ))}
      </motion.div>
    </div>
  )
}
