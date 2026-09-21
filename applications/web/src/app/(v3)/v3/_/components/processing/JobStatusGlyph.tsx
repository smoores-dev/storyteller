import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { type JobStatus } from "@/jobEvents"

export function JobStatusGlyph({
  status,
  className,
}: {
  status: JobStatus
  className?: string
}) {
  if (status === "RUNNING") {
    return (
      <icon.Loader className={cn("text-primary animate-spin", className)} />
    )
  }
  if (status === "PAUSED") {
    return (
      <icon.PlayerPause className={cn("text-muted-foreground", className)} />
    )
  }
  return <icon.Clock className={cn("text-muted-foreground", className)} />
}
