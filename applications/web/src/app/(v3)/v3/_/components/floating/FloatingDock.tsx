"use client"

import { type RefObject, createContext, useContext, useRef } from "react"

import { useSidebarMaybe } from "@v3/_/components/ui/sidebar"
import { cn } from "@v3/_/lib/utils"

import { useAppSelector } from "@/store/appState"
import {
  type MiniPlayerCorner,
  selectPreference,
} from "@/store/slices/preferencesSlice"

type FloatingDockContextValue = {
  corner: MiniPlayerCorner
  boundsRef: RefObject<HTMLDivElement | null>
  layoutKey: string
}

const FloatingDockContext = createContext<FloatingDockContextValue | null>(null)

export function useFloatingDock() {
  const context = useContext(FloatingDockContext)
  if (!context) {
    throw new Error("useFloatingDock must be used within a FloatingDock")
  }
  return context
}

export function FloatingDock({ children }: { children: React.ReactNode }) {
  const corner = useAppSelector((state) =>
    selectPreference(state, "miniPlayerCorner"),
  )
  const miniPlayerCollapsed = useAppSelector((state) =>
    selectPreference(state, "minimizedMiniPlayer"),
  )
  const sidebar = useSidebarMaybe()
  const boundsRef = useRef<HTMLDivElement>(null)

  const [vertical, horizontal] = corner.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ]
  const clearsSidebar = !!sidebar && !sidebar.isMobile

  const layoutKey = `${miniPlayerCollapsed}`

  return (
    <FloatingDockContext.Provider value={{ corner, boundsRef, layoutKey }}>
      <div
        ref={boundsRef}
        className={cn(
          "pointer-events-none fixed inset-4 z-50 flex gap-3",
          vertical === "bottom"
            ? "flex-col justify-end"
            : "flex-col-reverse justify-end",
          horizontal === "right" ? "items-end" : "items-start",
          clearsSidebar &&
            (sidebar.pinned
              ? "md:left-[calc(var(--sidebar-width)+(--spacing(4)))]"
              : "md:left-[calc(var(--sidebar-width-icon)+(--spacing(8)))]"),
        )}
      >
        {children}
      </div>
    </FloatingDockContext.Provider>
  )
}
