"use client"

import { type ComponentProps } from "react"

import { Slider } from "@v3/_/components/ui/slider"
import { cn } from "@v3/_/lib/utils"

type SliderProps = ComponentProps<typeof Slider>

export type ReaderSliderProps = {
  value: number
  onValueChange?: (value: number) => void
  onValueCommitted: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  thumbAlignment?: SliderProps["thumbAlignment"]
  marks?: SliderProps["marks"]
  restrictToMarks?: boolean
}

export const ReaderSlider = ({
  value,
  onValueChange,
  onValueCommitted,
  thumbAlignment = "edge",
  className,
  ...props
}: ReaderSliderProps) => (
  <Slider
    {...props}
    value={value}
    thumbAlignment={thumbAlignment}
    onValueChange={(next) => {
      onValueChange?.(typeof next === "number" ? next : next[0] ?? value)
    }}
    onValueCommitted={(next) => {
      onValueCommitted(typeof next === "number" ? next : next[0] ?? value)
    }}
    className={cn(
      "**:data-[slot='slider-indicator']:bg-reader-accent **:data-[slot='slider-marks']:text-reader-text-secondary **:data-[slot='slider-track']:bg-reader-border **:data-[slot='slider-thumb']:border-reader-accent **:data-[slot='slider-thumb']:bg-reader-bg **:data-[slot='slider-thumb']:ring-reader-accent/30",
      className,
    )}
  />
)
