"use client"

import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/cn"

export function ActionTray({
  show = true,
  className,
  children,
}: {
  show?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 10, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "bg-background border-border/80 flex w-full items-center gap-1 border px-2 py-1.5 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.4)]",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
