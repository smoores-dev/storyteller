"use client"

import { useMemo } from "react"

import { type JsColor } from "@storyteller-platform/okmain"

import { useUserPreferences } from "@v3/_/components/user-preferences-provider"

import {
  type CoverColorsBook,
  type CoverType,
  coverSwatches,
  resolveCoverColors,
} from "./coverSwatches"

export type CoverScopeProps = {
  style?: React.CSSProperties
  "data-cover"?: ""
}

export function useCoverColorsEnabled(): boolean {
  const { colorMode } = useUserPreferences()
  return colorMode !== "minimal"
}

export function useCoverScope(
  source: CoverColorsBook | JsColor[] | undefined,
  options?: { type?: CoverType; style?: React.CSSProperties },
): CoverScopeProps {
  const enabled = useCoverColorsEnabled()
  const type = options?.type
  const extraStyle = options?.style

  return useMemo(() => {
    const swatches = coverSwatches(
      source && enabled ? resolveCoverColors(source, type) : [],
    )
    if (!swatches.hasColors) {
      return extraStyle ? { style: extraStyle } : {}
    }

    const vars: Record<string, string> = {
      "--cover-1": swatches.primary.css,
      "--primary": swatches.primary.css,
      "--primary-foreground": swatches.primary.onColor,
    }
    if (swatches.secondary !== swatches.primary) {
      vars["--cover-2"] = swatches.secondary.css
    }

    return {
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
      style: { ...vars, ...extraStyle } as React.CSSProperties,
      "data-cover": "" as const,
    }
  }, [source, type, enabled, extraStyle])
}

export function CoverScope({
  book,
  type,
  className,
  style,
  children,
}: {
  book: CoverColorsBook | undefined
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
