"use client"

import { cn } from "@v3/_/lib/utils"

import { type ColorMode } from "@/database/userPreferencesTypes"

const SAMPLE = { r: 37, g: 99, b: 235 }
const solid = `rgb(${SAMPLE.r} ${SAMPLE.g} ${SAMPLE.b})`

// mirrors what CoverScope emits so the preview exercises the real css ladder
function sampleScope(level: ColorMode) {
  if (level === "minimal") return {}
  return {
    style: { "--cover-1": solid } as React.CSSProperties,
    "data-cover": "" as const,
  }
}

export function ColorfulnessPreview({ level }: { level: ColorMode }) {
  return (
    <div className="flex items-end gap-4" {...sampleScope(level)}>
      {/* a grid card */}
      <div className="w-28 shrink-0">
        <div className="bg-cover-well flex aspect-13/16 items-center justify-center rounded-lg p-2">
          <div
            className="h-full w-3/4 rounded shadow-md"
            style={{
              background: `linear-gradient(145deg, ${solid}, rgb(${SAMPLE.r} ${SAMPLE.g} ${SAMPLE.b} / 0.7))`,
            }}
          />
        </div>
        <div className="mt-1.5 space-y-0.5 px-0.5">
          <div className="bg-muted-foreground/30 h-1.5 w-1/2 rounded-full" />
          <p
            className={cn(
              "text-[0.8rem] leading-tight font-medium",
              level === "full" && "text-tinted-strong",
            )}
          >
            Sample title
          </p>
        </div>
      </div>

      {/* a details panel snippet */}
      <div className="border-border w-36 shrink-0 overflow-hidden rounded-lg border">
        <div className="bg-cover-header text-tinted-strong flex h-7 items-center px-2 text-[0.7rem]">
          Details
        </div>
        <div className="space-y-1 p-2">
          <div className="bg-muted-foreground/20 h-1.5 w-full rounded-full" />
          <div className="bg-muted-foreground/20 h-1.5 w-2/3 rounded-full" />
          <div className="bg-cover-accent text-cover-accent-foreground mt-2 inline-flex h-5 items-center rounded-md px-2 text-[0.65rem] font-medium">
            Read
          </div>
        </div>
      </div>
    </div>
  )
}
