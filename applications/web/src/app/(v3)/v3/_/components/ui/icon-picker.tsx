"use client"

import { Suspense, lazy, memo, useMemo, useState } from "react"

import * as icon from "@/icons"
import { ICON_REGISTRY, type IconEntry } from "@/icons/icon-registry"

import { Button } from "./button"
import { DynamicIcon } from "./dynamic-icon"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

const LazyIconGrid = lazy(() => import("./icon-picker-grid"))

type IconPickerProps = {
  value: string | null | undefined
  onChange: (iconId: string | null) => void
  color?: string | null
}

export const IconPicker = memo(function IconPicker({
  value,
  onChange,
  color,
}: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return ICON_REGISTRY

    const query = search.toLowerCase()
    return ICON_REGISTRY.filter(
      (entry) =>
        entry.id.includes(query) ||
        entry.tags.some((tag) => tag.includes(query)),
    )
  }, [search])

  const currentEntry = value ? ICON_REGISTRY.find((e) => e.id === value) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2"
            aria-label="Choose icon"
          >
            {currentEntry ? (
              <PreviewIcon entry={currentEntry} color={color} />
            ) : (
              <span className="text-muted-foreground text-xs">Choose icon</span>
            )}
          </Button>
        }
      />

      <PopoverContent className="w-72 p-3" align="start">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <icon.Search className="text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                }}
                placeholder="Search icons..."
                className="h-7 pl-7 text-xs"
              />
            </div>

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                <icon.Close className="size-3" />
                <span className="sr-only">Clear icon</span>
              </Button>
            )}
          </div>

          <Suspense
            fallback={
              <div className="flex h-48 items-center justify-center">
                <span className="text-muted-foreground text-xs">
                  Loading...
                </span>
              </div>
            }
          >
            <LazyIconGrid
              icons={filteredIcons}
              selectedId={value ?? null}
              color={color}
              onSelect={(id) => {
                onChange(id)
                setOpen(false)
              }}
            />
          </Suspense>
        </div>
      </PopoverContent>
    </Popover>
  )
})

function PreviewIcon({
  entry,
  color,
}: {
  entry: IconEntry
  color?: string | null
}) {
  return <DynamicIcon iconId={entry.id} color={color} className="size-4" />
}
