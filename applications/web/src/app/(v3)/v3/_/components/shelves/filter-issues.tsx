"use client"

import { type ReactNode } from "react"

import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { type ShelfFilterIssue } from "@/shelves"

export function useFilterIssueText() {
  const t = useTranslation("ShelfFilterIssues")

  const describe = (issue: ShelfFilterIssue): ReactNode => {
    switch (issue.kind) {
      case "retiredField":
        return issue.replacedBy
          ? t("retiredField", { old: issue.field, new: issue.replacedBy })
          : t("retiredFieldNoReplacement", { old: issue.field })
      case "unknownField":
        return t("unknownField", { field: issue.field })
      case "invalidCondition":
        return t("invalidCondition", {
          field: issue.field,
          message: issue.message,
        })
      case "unparseable":
        return t("unparseable")
    }
  }

  return { t, describe }
}

export function FilterIssueList({ issues }: { issues: ShelfFilterIssue[] }) {
  const { describe } = useFilterIssueText()
  return (
    <ul className="flex flex-col gap-0.5">
      {issues.map((issue, i) => (
        <li key={i}>{describe(issue)}</li>
      ))}
    </ul>
  )
}

export function FilterIssuesBanner({
  issues,
  action,
  className,
}: {
  issues: ShelfFilterIssue[]
  action?: ReactNode
  className?: string
}) {
  const { t } = useFilterIssueText()

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm",
        className,
      )}
    >
      <icon.AlertTriangle
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">{t.plain("shelfBroken")}</p>
        <div className="text-muted-foreground">
          <FilterIssueList issues={issues} />
        </div>
      </div>
      {action}
    </div>
  )
}
