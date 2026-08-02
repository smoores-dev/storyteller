import { useState } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@v3/_/components/ui/collapsible"

import { Button } from "@/app/(v3)/v3/_/components/ui/button"
import { cn } from "@/cn"
import * as icons from "@/icons"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectCollapsedDetailSections,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"

export function CollapsibleSection({
  title,
  sectionKey,
  children,
  defaultOpen = true,
  className,
  rightElement,
}: {
  title: string
  sectionKey: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
  rightElement?: React.ReactNode
}) {
  const dispatch = useAppDispatch()
  const collapsedSections = useAppSelector(selectCollapsedDetailSections)

  const persisted = sectionKey ? collapsedSections[sectionKey] : undefined
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const isOpen = persisted !== undefined ? !persisted : localOpen

  const handleOpenChange = (open: boolean) => {
    if (sectionKey) {
      dispatch(
        uiSettingsSlice.actions.toggleDetailSection({
          sectionKey,
          collapsed: !open,
        }),
      )
    } else {
      setLocalOpen(open)
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <div className="group/section [&_svg]:stroke-muted-foreground [&_svg]:size-3.5 [&_svg]:stroke-[1.5]">
        <div
          className={cn(
            "relative flex h-6 items-center gap-3",
            isOpen && "mb-3",

            "[&_button]:h-6",
          )}
        >
          <CollapsibleTrigger
            className="flex h-full w-full cursor-pointer items-center justify-between gap-3"
            aria-label={"Toggle section"}
          >
            <span className="section-label flex flex-1 items-center gap-2 truncate whitespace-nowrap">
              {/* {icon} */}
              {title}
            </span>
          </CollapsibleTrigger>
          <div className="flex items-center gap-1">
            {rightElement}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-hidden="true"
              onClick={() => {
                handleOpenChange(!isOpen)
              }}
            >
              <icons.ChevronDown
                className={cn(
                  "text-muted-foreground/80 size-3.5 stroke-[1.5]",
                  isOpen && "rotate-180",
                )}
              />
            </Button>
          </div>
        </div>

        <CollapsibleContent className={className}>
          {children}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
