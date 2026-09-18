"use client"

import { motion, useDragControls, useMotionValue } from "motion/react"
import { createContext, useContext, useLayoutEffect, useRef } from "react"

import { useLayoutAnimations } from "@v3/_/hooks/use-layout-animations"
import { cn } from "@v3/_/lib/utils"

import { useFloatingDock } from "./FloatingDock"

const SNAP_SPRING = { type: "spring", stiffness: 520, damping: 42 } as const
const INSTANT = { duration: 0 } as const
const CLICK_SLOP_PX = 4

export const CARD_CIRCLE_SIZE = 64
export const CARD_RING_THICKNESS = 4
export const CARD_RADIUS = 16

type FloatingCardContextValue = {
  startDrag: (event: React.PointerEvent) => void
}

const FloatingCardContext = createContext<FloatingCardContextValue | null>(null)

function useFloatingCard() {
  const context = useContext(FloatingCardContext)
  if (!context) {
    throw new Error("Floating card parts must be used within a FloatingCard")
  }
  return context
}

function FloatingCard({
  className,
  style,
  children,
}: {
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const { corner, boundsRef, layoutKey } = useFloatingDock()
  const dragControls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const animations = useLayoutAnimations()
  const transition = animations ? SNAP_SPRING : INSTANT

  useLayoutEffect(() => {
    x.jump(0)
    y.jump(0)
  }, [corner, x, y])

  const startDrag = (event: React.PointerEvent) => {
    dragControls.start(event)
  }

  return (
    <FloatingCardContext.Provider value={{ startDrag }}>
      <motion.div
        data-slot="floating-card"
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={boundsRef}
        dragElastic={0.12}
        dragMomentum={true}
        onMouseDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
        whileDrag={{ scale: 1.05, transition: { duration: 0.05 } }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        layout
        layoutDependency={layoutKey}
        transition={transition}
        style={{ ...style, x, y }}
        className={cn(
          "bg-popover text-popover-foreground border-border pointer-events-auto touch-none overflow-hidden rounded-2xl border shadow-lg",
          className,
        )}
      >
        {children}
      </motion.div>
    </FloatingCardContext.Provider>
  )
}

function FloatingCardHandle({
  className,
  onPointerDown,
  ...props
}: React.ComponentProps<"div">) {
  const { startDrag } = useFloatingCard()
  return (
    <div
      data-slot="floating-card-handle"
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if ((event.target as Element).closest("button,a,[role=menuitem]")) {
          return
        }
        startDrag(event)
      }}
      className={cn("cursor-grab active:cursor-grabbing", className)}
      {...props}
    />
  )
}

function FloatingCardHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <FloatingCardHandle
      data-slot="floating-card-header"
      className={cn("flex items-center gap-1 px-2 pt-2", className)}
      {...props}
    />
  )
}

function FloatingCardTitle({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="floating-card-title"
      className={cn(
        "text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs",
        className,
      )}
      {...props}
    />
  )
}

function FloatingCardBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="floating-card-body"
      className={cn("flex items-center gap-3 px-3 py-2", className)}
      {...props}
    />
  )
}

function FloatingCardMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <FloatingCardHandle
      data-slot="floating-card-media"
      className={cn("shrink-0 overflow-hidden rounded-sm", className)}
      {...props}
    />
  )
}

function FloatingCardContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="floating-card-content"
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  )
}

function FloatingCardFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="floating-card-footer"
      className={cn("px-3 pb-3", className)}
      {...props}
    />
  )
}

function FloatingCardButton({
  className,
  onPointerDown,
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const { startDrag } = useFloatingCard()
  const pressPoint = useRef({ x: 0, y: 0 })
  return (
    <button
      type="button"
      data-slot="floating-card-button"
      onPointerDown={(event) => {
        onPointerDown?.(event)
        pressPoint.current = { x: event.clientX, y: event.clientY }
        startDrag(event)
      }}
      onClick={(event) => {
        const moved = Math.hypot(
          event.clientX - pressPoint.current.x,
          event.clientY - pressPoint.current.y,
        )
        if (moved > CLICK_SLOP_PX) return
        onClick?.(event)
      }}
      className={cn("block cursor-grab active:cursor-grabbing", className)}
      {...props}
    />
  )
}

export {
  FloatingCard,
  FloatingCardBody,
  FloatingCardButton,
  FloatingCardContent,
  FloatingCardFooter,
  FloatingCardHandle,
  FloatingCardHeader,
  FloatingCardMedia,
  FloatingCardTitle,
}
