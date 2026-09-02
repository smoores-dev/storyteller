import React from "react"

import { cn } from "@/cn"

import { Slider } from "../../ui/slider"

export const ReaderSlider = (props: React.ComponentProps<typeof Slider>) => (
  <Slider
    // classNames={sliderClassNames}
    {...props}
    thumbAlignment="edge"
    className={cn(
      "**:data-[slot='slider-indicator']:bg-reader-accent **:data-[slot='slider-marks']:text-reader-text-secondary **:data-[slot='slider-track']:bg-reader-border",
      props.className,
    )}
  />
)
