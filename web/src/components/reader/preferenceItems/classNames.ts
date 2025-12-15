"use client"

import { type PopoverStylesNames, type SliderStylesNames } from "@mantine/core"

export const sliderClassNames = {
  root: "pb-6",
  track: "before:bg-reader-surface-hover",
  bar: "bg-reader-accent",
  label: "md:top-4",
  thumb: "border-reader-accent bg-reader-accent",
  mark: "border-reader-accent",
  markLabel: "text-reader-text",
} satisfies Partial<Record<SliderStylesNames, string>>

export const popoverClassNames = {
  arrow: "bg-reader-surface border-reader-border",
  dropdown: "border-reader-border bg-reader-surface",
} satisfies Partial<Record<PopoverStylesNames, string>>

export const selectClassNames = {
  root: "-mb-2",
  label: "text-reader-text mb-2 w-full",
  input: "text-reader-text bg-reader-bg border-reader-border",
  dropdown: "border-reader-border bg-reader-surface text-reader-text",
  option:
    "text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover",
}
