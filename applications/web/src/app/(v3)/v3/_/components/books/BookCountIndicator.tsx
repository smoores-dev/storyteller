"use client"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

export function BookCountIndicator({
  loaded,
  filtered,
  total,
  hasMore,
  isFetching,
  onLoadRemaining,
  alwaysLoadAll,
  onAlwaysLoadAllChange,
}: {
  loaded: number
  filtered: number | undefined
  total: number | undefined
  hasMore: boolean
  isFetching: boolean
  onLoadRemaining: () => void
  alwaysLoadAll: boolean
  onAlwaysLoadAllChange: (value: boolean) => void
}) {
  const t = useTranslation("BooksPage")

  if (total == null) return null

  const label =
    filtered != null && filtered < total
      ? t("count.summary", { shown: filtered, total })
      : t("count.allLoaded", { total })

  const remaining = Math.max(0, (filtered ?? total) - loaded)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs tabular-nums transition-colors"
          >
            {isFetching && alwaysLoadAll ? t("count.loadingAll") : label}
            <icon.ChevronDown className="size-3" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem
          disabled={!hasMore || isFetching}
          onClick={onLoadRemaining}
        >
          <icon.Download className="mr-2 size-4" />
          {t("count.loadRemaining", { count: remaining })}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem
          checked={alwaysLoadAll}
          onClick={() => {
            onAlwaysLoadAllChange(!alwaysLoadAll)
          }}
        >
          {t("count.alwaysLoadAll")}
        </DropdownMenuCheckboxItem>
        <p
          className={cn(
            "text-muted-foreground px-2 pt-0.5 pb-1.5 text-xs",
            "max-w-56 text-pretty",
          )}
        >
          {t("count.alwaysLoadAllHint")}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
