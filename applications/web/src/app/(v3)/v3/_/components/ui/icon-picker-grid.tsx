"use client"

import { memo, useEffect, useState } from "react"

import { cn } from "@v3/_/lib/utils"

import { type IconEntry } from "@/icons/icon-registry"

type TablerIconComponent = React.ComponentType<{
  className?: string
  style?: React.CSSProperties
}>

type IconPickerGridProps = {
  icons: IconEntry[]
  selectedId: string | null
  color?: string | null
  onSelect: (id: string) => void
}

function IconPickerGrid({
  icons,
  selectedId,
  color,
  onSelect,
}: IconPickerGridProps) {
  const [tablerIcons, setTablerIcons] = useState<
    Record<string, TablerIconComponent>
  >({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    void import("@/icons/registry-components").then((mod) => {
      if (cancelled) return

      const resolved: Record<string, TablerIconComponent> = {}

      for (const entry of icons) {
        const Icon = mod.REGISTRY_ICON_COMPONENTS[entry.tabler]
        if (Icon) {
          resolved[entry.id] = Icon
        }
      }

      setTablerIcons(resolved)
      setLoaded(true)
    })

    return () => {
      cancelled = true
    }
  }, [icons])

  if (!loaded) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-muted-foreground text-xs">Loading icons...</span>
      </div>
    )
  }

  if (icons.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <span className="text-muted-foreground text-xs">No icons found</span>
      </div>
    )
  }

  return (
    <div className="grid max-h-48 grid-cols-7 gap-1 overflow-y-auto">
      {icons.map((entry) => {
        const Icon = tablerIcons[entry.id]
        if (!Icon) return null

        const isSelected = entry.id === selectedId

        return (
          <button
            key={entry.id}
            type="button"
            aria-label={entry.id}
            title={entry.id}
            onClick={() => {
              onSelect(entry.id)
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-md transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            <Icon
              className="size-4"
              style={color && !isSelected ? { color } : undefined}
            />
          </button>
        )
      })}
    </div>
  )
}

export default memo(IconPickerGrid)
