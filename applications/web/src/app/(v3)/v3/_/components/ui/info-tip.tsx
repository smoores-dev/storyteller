"use client"

import { type ReactNode } from "react"

import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

export function InfoTip({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const t = useTranslation("Labels")

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={t.plain("moreInfo")}
        render={
          <button
            type="button"
            className={cn(
              "text-muted-foreground hover:text-foreground inline-flex shrink-0 cursor-help items-center rounded-full align-middle",
              className,
            )}
          />
        }
      >
        <icon.InfoCircle className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left font-normal">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
