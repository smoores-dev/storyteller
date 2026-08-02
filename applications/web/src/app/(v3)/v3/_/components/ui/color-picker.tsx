"use client"

import { memo, useState } from "react"

import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { ACCENT_PRESETS } from "@/accent-presets"

import { Button } from "./button"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

type ColorPickerProps = {
  value: string | null | undefined
  onChange: (color: string | null) => void
}

export const ColorPicker = memo(function ColorPicker({
  value,
  onChange,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [customColor, setCustomColor] = useState(value ?? "")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2"
          >
            {value ? (
              <span
                className="size-4 rounded-full border"
                style={{ backgroundColor: value }}
              />
            ) : (
              <span className="text-muted-foreground text-xs">
                Choose color
              </span>
            )}
          </Button>
        }
      />

      <PopoverContent className="w-56 p-3" align="start">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-8 gap-1">
            {ACCENT_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onChange(color)
                  setOpen(false)
                }}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform hover:scale-110",
                  value === color ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={customColor}
              onChange={(e) => {
                setCustomColor(e.target.value)
              }}
              placeholder="#hex"
              className="h-7 flex-1 text-xs"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  customColor.match(/^#[0-9a-f]{3,8}$/i)
                ) {
                  onChange(customColor)
                  setOpen(false)
                }
              }}
            />

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  onChange(null)
                  setCustomColor("")
                  setOpen(false)
                }}
              >
                <icon.Close className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})
