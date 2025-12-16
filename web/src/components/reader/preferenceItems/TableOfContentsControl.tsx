import { Popover, ScrollArea, Text } from "@mantine/core"
import { IconList } from "@tabler/icons-react"
import classNames from "classnames"
import { useCallback, useEffect, useMemo } from "react"

import { useMenuToggle } from "@/components/reader/hooks/useMenuToggle"
import { navItemPressed } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { getTocItems } from "@/store/readerRegistry"
import { selectCurrentToCLocator } from "@/store/slices/readingSessionSlice"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import { popoverClassNames } from "./classNames"

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
            <button
              key={item.id}
              className={classNames(
                "hover:bg-reader-surface-hover w-full rounded p-2 text-left transition-colors",
                {
                  "text-reader-text-muted": !item.locator,
                  "bg-reader-accent/10":
                    item.href === currentChapterLocator?.href ||
                    item.locator?.href === currentChapterLocator?.href,
                },
              )}
              id={item.id}
              style={{ paddingLeft: `${item.level * 16 + 8}px` }}
              onClick={() => {
                if (!item.locator) {
                  console.warn("[TableOfContentsControl] No locator", item)
                  return
                }

                dispatch(navItemPressed({ locator: item.locator }))
              }}
            >
              <Text size="sm" className="text-reader-text">
                {item.title}
              </Text>
            </button>
          )
        })
      ) : (
        <div className="py-8 text-center">
          <Text size="sm" className="text-reader-text-muted">
            No table of contents available
          </Text>
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
    <Popover
      withArrow
      opened={props.opened ?? isOpen}
      onDismiss={closeMenu}
      classNames={popoverClassNames}
      portalProps={{
        target: props.targetDocument?.body ?? window.document.body,
      }}
    >
      <Popover.Target>
        <ToolbarIcon
          targetDocument={props.targetDocument ?? window.document}
          label="Table of Contents"
          icon={Icon}
          onClick={toggleMenu}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <ScrollArea className="h-96 w-80">
          <TocList />
        </ScrollArea>
      </Popover.Dropdown>
    </Popover>
  )
}

TableOfContentsControl.DrawerContent = TocList
