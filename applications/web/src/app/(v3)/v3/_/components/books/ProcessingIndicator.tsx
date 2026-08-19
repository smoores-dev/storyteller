import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import { STAGE_ORDER } from "@/work/stages"

const TOTAL_STAGES = Object.keys(STAGE_ORDER).length

function getOverallProgress(book: BookWithRelations): number | null {
  const readaloud = book.readaloud
  if (!readaloud) return null

  if (readaloud.status === "QUEUED") return 0

  if (readaloud.status !== "PROCESSING") return null

  const stageOrder = STAGE_ORDER[readaloud.currentStage]

  const stageProgress = readaloud.stageProgress

  return (stageOrder + stageProgress) / TOTAL_STAGES
}

type ProcessingIndicatorProps = {
  book: BookWithRelations
  size?: number
  className?: string
}

export function ProcessingIndicator({
  book,
  size = 20,
  className,
}: ProcessingIndicatorProps) {
  const progress = getOverallProgress(book)

  if (progress === null) return null

  const strokeWidth = 2.5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full backdrop-blur-sm",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(63, 61, 61, 0.25)"
          strokeWidth={strokeWidth}
        />

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={progress === 0 ? 0 : offset}
          strokeLinecap="round"
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-out",
            progress === 0 && "origin-center animate-spin",
            progress === 0 ? "stroke-amber-500" : "stroke-primary",
          )}
          style={
            progress === 0
              ? { strokeDashoffset: circumference * 0.75 }
              : undefined
          }
        />
      </svg>
    </div>
  )
}
