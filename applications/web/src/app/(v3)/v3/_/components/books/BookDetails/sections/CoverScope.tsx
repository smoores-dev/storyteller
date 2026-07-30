"use client"

import { useTheme } from "next-themes"
import { useMemo } from "react"

import { type BookWithRelations } from "@/database/books"

import {
  type CoverColor,
  type CoverType,
  ensureContrast,
  useColorPreferences,
  useCoverColors,
} from "./useCoverColors"

function channels(color: CoverColor): string {
  const { r, g, b } = color.rgb
  return `${r} ${g} ${b}`
}

export type CoverScopeProps = {
  style: React.CSSProperties
  "data-cover-tint"?: ""
  "data-cover-accent"?: ""
}

export function useCoverScope(
  book: BookWithRelations | undefined,
  options?: { type?: CoverType; style?: React.CSSProperties },
): CoverScopeProps {
  const { primary, accent, hasColors } = useCoverColors(book, {
    type: options?.type,
  })
  const { level, intensity } = useColorPreferences()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const extraStyle = options?.style

  return useMemo(() => {
    if (!hasColors) return { style: { ...extraStyle } }

    const cPrimary = ensureContrast(primary, isDark)
    const cAccent = ensureContrast(accent, isDark)
    const showTint = level !== "minimal"
    const showAccent = level === "full"

    const vars: Record<string, string | number> = {
      "--cover-rgb": channels(primary),
      "--cover-solid-rgb": cPrimary.channels,
      "--cover-accent-rgb": channels(accent),
      "--cover-accent-solid-rgb": cAccent.channels,
      "--cover-intensity": intensity,

      ...(intensity > 0.5 && {
        "--cover-background-mix": isDark ? "black" : "white",
      }),
    }

    if (showAccent) {
      vars["--primary"] = cPrimary.solid
      vars["--primary-foreground"] = cPrimary.onColor
      vars["--cover-accent-color"] = cAccent.solid
      vars["--cover-accent-foreground"] = cAccent.onColor
    }

    return {
      style: { ...vars, ...extraStyle } as React.CSSProperties,
      ...(showTint ? { "data-cover-tint": "" as const } : {}),
      ...(showAccent ? { "data-cover-accent": "" as const } : {}),
    }
  }, [primary, accent, hasColors, level, intensity, isDark, extraStyle])
}

export function CoverScope({
  book,
  type,
  className,
  style,
  children,
}: {
  book: BookWithRelations | undefined
  type?: CoverType
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const scope = useCoverScope(book, { type, style })
  return (
    <div className={className} {...scope}>
      {children}
    </div>
  )
}
