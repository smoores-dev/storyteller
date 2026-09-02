import { useEffect } from "react"

import { useMenuToggle } from "@v3/_/components/reader/hooks/useMenuToggle"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { navItemPressed } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { getTocItems } from "@/store/readerRegistry"
import { selectCurrentToCLocator } from "@/store/slices/readingSessionSlice"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"

const TocList = () => {
  const tocItems = getTocItems()
  const currentChapterLocator = useAppSelector(selectCurrentToCLocator)
  const dispatch = useAppDispatch()

  if (!tocItems || tocItems.length === 0) {
    return (
      <div className="py-8 text-center">
        <span className="text-reader-text-muted text-sm">
          No table of contents available
        </span>
      </div>
    )
  }

  return (
    <>
      {tocItems.map((item) => {
        const isCurrent =
          item.href === currentChapterLocator?.href ||
          item.locator?.href === currentChapterLocator?.href
        return (
          <FilterableMenuItem
            key={item.id}
            textValue={item.title}
            disabled={!item.locator}
            className={cn(
              "hover:bg-reader-surface-hover data-highlighted:bg-reader-accent/30 w-full rounded-sm p-2 text-left transition-colors",
              isCurrent && "bg-reader-accent/10",
            )}
            onSelect={() => {
              if (!item.locator) return
              dispatch(navItemPressed({ locator: item.locator }))
            }}
          >
            <span
              id={item.id}
              className={cn(
                "text-reader-text flex grow items-center text-sm",
                !item.locator && "text-reader-text-muted",
              )}
              style={{ paddingLeft: `${item.level * 16}px` }}
            >
              {item.title}
            </span>
            {isCurrent && (
              <icon.Check size="sm" className="text-reader-accent shrink-0" />
            )}
          </FilterableMenuItem>
        )
      })}
    </>
  )
}

export const TableOfContentsControl = (props: ToolProps) => {
  const currentChapterLocator = useAppSelector(selectCurrentToCLocator)

  const { isOpen, setOpen, toggleMenu } = useMenuToggle()

  useEffect(() => {
    if (!isOpen || !currentChapterLocator?.id) return

    const timeout = setTimeout(() => {
      document.getElementById(currentChapterLocator.id)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }, 50)
    return () => {
      clearTimeout(timeout)
    }
  }, [currentChapterLocator?.id, isOpen])

  if (props.mode === "raw") {
    return <TocList />
  }

  if (props.mode === "drawer") {
    return (
      <ToolbarIcon
        label="Table of contents"
        icon={<icon.List size="lg" />}
        onClick={() => {
          props.openDrawer({ type: "table-of-contents" }, "Table of contents")
        }}
      />
    )
  }

  return (
    <FilterableMenu open={isOpen} onOpenChange={setOpen}>
      <FilterableMenuTrigger
        render={
          <ToolbarIcon
            label="Table of contents"
            icon={<icon.List size="lg" />}
            onClick={toggleMenu}
          />
        }
      />
      <FilterableMenuContent className="bg-reader-surface **:data-[slot='filterable-menu-search-box']:text-reader-text **:data-[slot='filterable-menu-search-box']:placeholder:text-reader-text-muted">
        <TocList />
      </FilterableMenuContent>
    </FilterableMenu>
  )
}

TableOfContentsControl.DrawerContent = TocList
