"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@v3/_/lib/utils"

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

function Slider({
  className,
  secondThumb = false,
  children,
  marks,
  restrictToMarks: _restrictToMarks = false,
  ...props
}: SliderPrimitive.Root.Props & {
  className?: string
  secondThumb?: boolean
  marks?: { value: number; label: string; className?: string }[]
  restrictToMarks?: boolean
}) {
  return (
    <SliderPrimitive.Root data-slot="slider" {...props}>
      <SliderPrimitive.Control
        className={cn(
          "flex w-full touch-none flex-col items-center py-2 select-none",
          className,
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-muted relative h-1.5 w-full grow rounded-full"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="bg-foreground/25 absolute h-full rounded-full"
          />
          {Array.from({ length: secondThumb ? 2 : 1 }).map((_, index) => (
            <Tooltip key={index}>
              <TooltipTrigger
                render={
                  <SliderPrimitive.Thumb
                    data-slot="slider-thumb"
                    data-index={index}
                    index={index}
                    key={index}
                    className="border-foreground/40 bg-background ring-ring/30 block size-4 rounded-full border-2 shadow-sm transition-shadow outline-none focus-visible:ring-2 data-disabled:cursor-not-allowed data-disabled:opacity-50"
                  />
                }
              />
              <TooltipContent>
                <SliderPrimitive.Value />
              </TooltipContent>
            </Tooltip>
          ))}
        </SliderPrimitive.Track>
        <div className="relative h-4 w-full" data-slot="slider-marks">
          {marks &&
            marks.map((mark) => (
              <div
                key={mark.value}
                className={cn(
                  "absolute top-3 text-xs",
                  mark.value === (props.max ?? 100)
                    ? "-translate-x-full"
                    : mark.value === (props.min ?? 0)
                      ? "left-0"
                      : "-translate-x-1/2",
                  mark.className,
                  // "after:bg-foreground after:relative after:-top-7 after:block after:h-3 after:w-px after:text-xs after:content-['']",
                  // mark.value === (props.max ?? 100)
                  //   ? "after:left-full"
                  //   : mark.value === (props.min ?? 0)
                  //     ? "after:left-0"
                  //     : "after:left-1/2",
                )}
                data-slot="slider-mark"
                data-value={mark.value}
                style={{
                  left: `${((mark.value - (props.min ?? 0)) / ((props.max ?? 100) - (props.min ?? 0))) * 100}%`,
                }}
              >
                <span>{mark.label}</span>
              </div>
            ))}
        </div>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

function VerticalSlider({
  className,
  ...props
}: SliderPrimitive.Root.Props & { className?: string }) {
  return (
    <SliderPrimitive.Root data-slot="slider" orientation="vertical" {...props}>
      <SliderPrimitive.Control
        className={cn(
          "flex w-full touch-none items-center py-2 select-none",
          className,
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-muted relative h-full w-1.5 grow rounded-full"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="bg-primary absolute h-full rounded-full"
          />
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            className="border-primary bg-background ring-ring/30 block size-4 rounded-full border-2 shadow-sm transition-shadow outline-none focus-visible:ring-2 data-disabled:cursor-not-allowed data-disabled:opacity-50"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider, VerticalSlider }
