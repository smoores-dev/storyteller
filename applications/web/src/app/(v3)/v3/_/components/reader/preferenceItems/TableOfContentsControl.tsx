import { IconList } from "@tabler/icons-react"

import { useCallback, useEffect, useMemo } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/(v3)/v3/_/components/ui/dropdown-menu"
import { cn } from "@/cn"
import { useMenuToggle } from "@/components/reader/hooks/useMenuToggle"
import { navItemPressed } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { getTocItems } from "@/store/readerRegistry"
import { selectCurrentToCLocator } from "@/store/slices/readingSessionSlice"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import * as icon from "@/icons"
import {
  FilterableMenuItem,
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"

type Props = ToolProps & { opened?: boolean }

const TocList = () => {
  const tocItems = getTocItems()
  const currentChapterLocator = useAppSelector(selectCurrentToCLocator)
  const dispatch = useAppDispatch()

  return (
    <>
      {tocItems && tocItems.length > 0 ? (
        tocItems.map((item) => {
          return (
            <FilterableMenuItem
              key={item.id}
              className={cn(
                "hover:bg-reader-surface-hover data-highlighted:bg-reader-accent/30 w-full rounded-sm p-2 text-left",
                {
                  "text-reader-text-muted": !item.locator,
                  "bg-reader-accent/10":
                    item.href === currentChapterLocator?.href ||
                    item.locator?.href === currentChapterLocator?.href,
                },
              )}
              id={item.id}
              textValue={item.title}
              style={{ paddingLeft: `${item.level * 16}px` }}
              onClick={() => {
                if (!item.locator) {
                  console.warn("[TableOfContentsControl] No locator", item)
                  return
                }

                dispatch(navItemPressed({ locator: item.locator }))
              }}
            >
              <span className="text-reader-text grow text-sm">
                {item.title}
              </span>
              {(item.href === currentChapterLocator?.href ||
                item.locator?.href === currentChapterLocator?.href) && (
                <icon.Check size="sm" className="text-reader-accent" />
              )}
            </FilterableMenuItem>
          )
        })
      ) : (
        <div className="py-8 text-center">
          <span className="text-reader-text-muted text-sm">
            No table of contents available
          </span>
        </div>
      )}
    </>
  )
}

export const TableOfContentsControl = (props: Props) => {
  const currentChapterLocator = useAppSelector(selectCurrentToCLocator)

  const { isOpen, closeMenu, toggleMenu } = useMenuToggle()

  useEffect(() => {
    async function onTocOpenChange(open: boolean) {
      await new Promise((resolve) => setTimeout(resolve, 50))

      if (open) {
        if (currentChapterLocator?.id) {
          document.getElementById(currentChapterLocator.id)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          })
        }
      }
    }
    void onTocOpenChange(props.opened ?? isOpen)
  }, [currentChapterLocator?.id, isOpen, props.opened])

  const onClickDrawer = useCallback(() => {
    if (props.mode !== "drawer") return
    props.openDrawer({ type: "table-of-contents" }, "Table of Contents")
  }, [props])

  const Icon = useMemo(() => <IconList size={18} />, [])

  if (props.mode === "raw") {
    return <TocList />
  }

  if (props.mode === "drawer") {
    return (
      <ToolbarIcon
        label="Table of Contents"
        icon={Icon}
        onClick={onClickDrawer}
      />
    )
  }

  return (
    <FilterableMenu open={props.opened ?? isOpen} onOpenChange={toggleMenu}>
      <FilterableMenuTrigger
        render={
          <ToolbarIcon
            label="Table of Contents"
            icon={Icon}
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
