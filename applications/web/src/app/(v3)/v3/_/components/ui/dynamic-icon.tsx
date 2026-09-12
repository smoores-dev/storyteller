"use client"

import { type ComponentProps, Suspense, lazy, memo, useMemo } from "react"

import { ICON_MAP } from "@/icons/icon-registry"

type IconComponent = React.ComponentType<{
  className?: string
  style?: React.CSSProperties
}>

const iconCache = new Map<string, React.LazyExoticComponent<IconComponent>>()

function getLazyIcon(
  tablerName: string,
): React.LazyExoticComponent<IconComponent> {
  const cached = iconCache.get(tablerName)
  if (cached) return cached

  const component = lazy(async () => {
    const { REGISTRY_ICON_COMPONENTS } =
      await import("@/icons/registry-components")
    const Icon = REGISTRY_ICON_COMPONENTS[tablerName]

    if (!Icon) {
      return { default: FallbackIcon as IconComponent }
    }

    return { default: Icon }
  })

  iconCache.set(tablerName, component)
  return component
}

function FallbackIcon({
  className,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

type DynamicIconProps = {
  iconId: string | null | undefined
  color?: string | null
  className?: string
} & Omit<ComponentProps<"svg">, "color">

export const DynamicIcon = memo(function DynamicIcon({
  iconId,
  color,
  className = "size-4",
  ...rest
}: DynamicIconProps) {
  const LazyIcon = useMemo(() => {
    if (!iconId) return null

    const entry = ICON_MAP[iconId]
    if (!entry) return null

    return getLazyIcon(entry.tabler)
  }, [iconId])

  if (!LazyIcon) {
    return null
  }

  return (
    <Suspense fallback={<span className={className} />}>
      <LazyIcon
        className={className}
        style={color ? { color } : undefined}
        {...(rest as Record<string, unknown>)}
      />
    </Suspense>
  )
})
