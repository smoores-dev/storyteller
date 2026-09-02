"use client"

import {
  type DragControls,
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

export function FloatingPlayer({
  corner,
  expanded,
  className,
  style,
  children,
}: {
  corner: MiniPlayerCorner
  expanded: boolean
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

  return (
    <div ref={boundsRef} className="pointer-events-none fixed inset-4 z-[60]">
      <motion.div
        ref={playerRef}
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={boundsRef}
        dragElastic={0.12}
        dragMomentum={true}
        // prevent selection of text
        onMouseDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
        whileDrag={{ scale: 1.05, transition: { duration: 0.05 } }}
        // onDragEnd={handleDragEnd}
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
