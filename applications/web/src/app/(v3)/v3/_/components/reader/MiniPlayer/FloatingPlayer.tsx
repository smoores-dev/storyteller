"use client"

import {
  type DragControls,
  type PanInfo,
  animate,
  motion,
  useDragControls,
  useMotionValue,
} from "motion/react"
import { useLayoutEffect, useRef } from "react"

import { useLayoutAnimations } from "@v3/_/hooks/use-layout-animations"
import { cn } from "@v3/_/lib/utils"

import { type MiniPlayerCorner } from "@/store/slices/preferencesSlice"

const SNAP_SPRING = { type: "spring", stiffness: 520, damping: 42 } as const
const INSTANT = { duration: 0 } as const
const FLING_LOOKAHEAD_SECONDS = 0.15

export function FloatingPlayer({
  corner,
  expanded,
  onCornerChange,
  className,
  style,
  children,
}: {
  corner: MiniPlayerCorner
  expanded: boolean
  onCornerChange: (corner: MiniPlayerCorner) => void
  className?: string
  style?: React.CSSProperties
  children: (dragControls: DragControls) => React.ReactNode
}) {
  const boundsRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const dragControls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const animations = useLayoutAnimations()
  const transition = animations ? SNAP_SPRING : INSTANT

  const [vertical, horizontal] = corner.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ]

  useLayoutEffect(() => {
    x.jump(0)
    y.jump(0)
  }, [corner, x, y])

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const bounds = boundsRef.current?.getBoundingClientRect()
    const player = playerRef.current?.getBoundingClientRect()
    if (!bounds || !player) return

    const centerX =
      player.left + player.width / 2 + info.velocity.x * FLING_LOOKAHEAD_SECONDS
    const centerY =
      player.top + player.height / 2 + info.velocity.y * FLING_LOOKAHEAD_SECONDS
    const nextVertical =
      centerY < bounds.top + bounds.height / 2 ? "top" : "bottom"
    const nextHorizontal =
      centerX < bounds.left + bounds.width / 2 ? "left" : "right"
    const next: MiniPlayerCorner = `${nextVertical}-${nextHorizontal}`

    const targetLeft =
      nextHorizontal === "left" ? bounds.left : bounds.right - player.width
    const targetTop =
      nextVertical === "top" ? bounds.top : bounds.bottom - player.height

    void Promise.all([
      animate(x, x.get() + (targetLeft - player.left), transition),
      animate(y, y.get() + (targetTop - player.top), transition),
    ]).then(() => {
      if (next !== corner) onCornerChange(next)
    })
  }

  return (
    <div ref={boundsRef} className="pointer-events-none fixed inset-4 z-[60]">
      <motion.div
        ref={playerRef}
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={boundsRef}
        dragElastic={0.12}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        layout
        layoutDependency={expanded}
        transition={transition}
        style={{ ...style, x, y, [vertical]: 0, [horizontal]: 0 }}
        className={cn("pointer-events-auto absolute touch-none", className)}
      >
        {children(dragControls)}
      </motion.div>
    </div>
  )
}
