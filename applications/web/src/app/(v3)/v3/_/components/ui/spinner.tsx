import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

function Spinner({ className, stroke, ...props }: React.ComponentProps<"svg">) {
  // otherwise weird type error
  const Icon = icon.LoaderIOSish as React.FC<React.ComponentProps<"svg">>

  return (
    <Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
      {...(stroke ? { stroke } : {})}
    />
  )
}

export { Spinner }
