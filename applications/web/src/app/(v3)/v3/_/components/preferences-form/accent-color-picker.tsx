"use client"

import { cn } from "@v3/_/lib/utils"

import {
  ACCENT_PRESETS as PRESETS,
  DEFAULT_ACCENT_COLOR as DEFAULT_SWATCH,
} from "@/accent-presets"
import * as icon from "@/icons"

function Swatch({
  color,
  selected,
  onClick,
  label,
}: {
  color: string
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "ring-offset-background flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110",
        selected && "ring-foreground/40 ring-2 ring-offset-2",
      )}
      style={{ background: color }}
    >
      {selected && (
        <icon.Check className="size-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" />
      )}
    </button>
  )
}

export function AccentColorPicker({
  value,
  onChange,
  defaultLabel,
  customLabel,
  defaultColor,
}: {
  value: string | null
  onChange: (value: string | null) => void
  defaultLabel: string
  customLabel: string
  // the color the "default" swatch renders
  defaultColor?: string | null
}) {
  // a value not in the preset list (and not null) is treated as custom
  const isPreset = value !== null && PRESETS.includes(value as never)
  const customValue = !isPreset && value !== null ? value : DEFAULT_SWATCH
  const defaultSwatch = defaultColor ?? DEFAULT_SWATCH

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Swatch
        color={defaultSwatch}
        selected={value === null}
        onClick={() => {
          onChange(null)
        }}
        label={defaultLabel}
      />

      <span className="bg-border mx-1 h-6 w-px" aria-hidden />

      {PRESETS.map((preset) => (
        <Swatch
          key={preset}
          color={preset}
          selected={value === preset}
          onClick={() => {
            onChange(preset)
          }}
          label={preset}
        />
      ))}

      <label
        className={cn(
          "ring-offset-background relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full transition-transform hover:scale-110",
          !isPreset &&
            value !== null &&
            "ring-foreground/40 ring-2 ring-offset-2",
        )}
        style={{
          background:
            "conic-gradient(red, orange, yellow, lime, aqua, blue, magenta, red)",
        }}
        title={customLabel}
      >
        <input
          type="color"
          value={customValue}
          onChange={(e) => {
            onChange(e.target.value)
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={customLabel}
        />
      </label>
    </div>
  )
}
