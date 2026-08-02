"use client"

import { useVirtualizer } from "@tanstack/react-virtual"
import { usePathname } from "next/navigation"
import { useCallback, useMemo, useRef, useState } from "react"

import { useOptionalBookListPageState } from "@v3/_/components/books/BookListPage"
import { SearchInput } from "@v3/_/components/books/SearchInput"
import { SelectionCheckbox } from "@v3/_/components/books/SelectionCheckbox"
import {
  EntityCreateDialog,
  useCreateEntity,
} from "@v3/_/components/library/EntityCreateDialog"
import { EntityEditDialog } from "@v3/_/components/library/EntityEditDialog"
import { SidebarEntityActions } from "@v3/_/components/library/SidebarEntityActions"
import {
  type FacetValue,
  type LibraryEntityType,
  NONE_KEY,
} from "@v3/_/components/library/library-sections"
import { Button } from "@v3/_/components/ui/button"
import {
  ConfirmDialog,
  useConfirmAction,
} from "@v3/_/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { DynamicIcon } from "@v3/_/components/ui/dynamic-icon"
import { V3Link } from "@v3/_/components/v3-link"
import { type BookFiltersController } from "@v3/_/hooks/use-book-filters"
import { useDeleteEntity } from "@v3/_/hooks/use-delete-entity"
import {
  ESCAPE_PRIORITY,
  useEscapeHandler,
} from "@v3/_/hooks/use-escape-cascade"
import { useItemSelection } from "@v3/_/hooks/use-item-selection"
import { useBookInSidePanel } from "@v3/_/hooks/use-open-book"
import { usePinShelf } from "@v3/_/hooks/use-pin-shelf"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { isWellKnownStatus } from "@/database/statusKinds"
import * as icon from "@/icons"
import { type ShelfFilterNode } from "@/shelves"
import { type UUID } from "@/uuid"

const SIDEBAR_ROW_HEIGHT = 32

const HOVER_PREFETCH_DELAY_MS = 50

export type SidebarSortMode = "name" | "count"
export type SidebarSortDirection = "asc" | "desc"

function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null

  while (el) {
    const overflowY = getComputedStyle(el).overflowY
    if (overflowY === "auto" || overflowY === "scroll") return el
    el = el.parentElement
  }

  return null
}

export function LibrarySidebar({
  title,
  items,
  selectedKey,
  isLoading,
  search,
  onSearchChange,
  sortMode,
  sortDirection,
  onSortChange,
  onItemClick,
  onHoverItem,
  entityType,
  toShelfFilter,
  isItemLocked,
}: {
  title: string
  items: FacetValue[]
  selectedKey: string | null
  isLoading: boolean
  search: string
  onSearchChange: (value: string) => void
  sortMode: SidebarSortMode
  sortDirection: SidebarSortDirection
  onSortChange: (mode: SidebarSortMode, direction: SidebarSortDirection) => void
  onItemClick: (key: string) => void
  // the page's live filter controller rides along so the handler can warm the
  // exact query the click would run (same sort + search = same cache key)
  onHoverItem?: (key: string, controller?: BookFiltersController) => void
  entityType?: LibraryEntityType | undefined
  toShelfFilter?: ((itemKey: string) => ShelfFilterNode) | undefined
  isItemLocked?: ((item: FacetValue) => boolean) | undefined
}) {
  const t = useTranslation("LibraryPage")
  const tEntity = useTranslation("EntityActions")
  const c = useCommon()

  const itemSelection = useItemSelection()

  useEscapeHandler(
    ESCAPE_PRIORITY.sidebarSelection,
    itemSelection.stopSelecting,
    itemSelection.isSelecting,
  )

  const pageState = useOptionalBookListPageState()
  const hoverDepsRef = useRef({
    onHoverItem,
    controller: pageState?.controller,
  })
  hoverDepsRef.current = { onHoverItem, controller: pageState?.controller }
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleHoverItem = useCallback((key: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => {
      const { onHoverItem: handler, controller } = hoverDepsRef.current
      handler?.(key, controller)
      hoverTimerRef.current = null
    }, HOVER_PREFETCH_DELAY_MS)
  }, [])
  const cancelHoverItem = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuTarget, setMenuTarget] = useState<FacetValue | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const deleteEntity = useDeleteEntity(entityType)

  const handleRowDelete = useCallback(async () => {
    if (!menuTarget) return
    await deleteEntity(menuTarget.key as UUID)
    setMenuOpen(false)
  }, [menuTarget, deleteEntity])

  const rowDeleteAction = useConfirmAction({
    onConfirm: handleRowDelete,
    title: menuTarget
      ? tEntity("deleteTitle", {
          count: 1,
          entity: entityType
            ? tEntity(`entityTypes.${entityType}` as "entityTypes.tag", {
                count: 1,
              })
            : "",
        })
      : "",
    description: tEntity("deleteDescription"),
    confirmLabel: c("actions.delete"),
    variant: "destructive",
  })

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<FacetValue | null>(null)

  const handleMenuOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setMenuOpen(true)
        return
      }

      setMenuOpen(false)
      setMenuAnchor(null)
      // otherwise it will not delete item
      if (rowDeleteAction.dialogProps.open || editDialogOpen) return
      setMenuTarget(null)
    },
    [rowDeleteAction.dialogProps.open, editDialogOpen],
  )

  const handleOpenItemMenu = useCallback(
    (item: FacetValue, anchor: HTMLElement) => {
      setMenuTarget(item)
      setMenuAnchor(anchor)
      setMenuOpen(true)
    },
    [],
  )

  const handleEditItem = useCallback((item: FacetValue) => {
    setEditItem(item)
    setEditDialogOpen(true)
  }, [])

  const { canCreate, createLabel } = useCreateEntity(entityType)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const { pinShelf } = usePinShelf()
  const canPin = !!toShelfFilter

  const handlePinItem = useCallback(
    (item: FacetValue) => {
      if (!toShelfFilter) return
      void pinShelf(item.name, toShelfFilter(item.key))
    },
    [toShelfFilter, pinShelf],
  )

  return (
    <div className="relative h-full">
      <div className="scroll-y relative flex h-full flex-col">
        {/* DONT MAKE FLEX CONTAINER THE SEARCH INPUT WILL NOT BE THE CORRECT HEIGHT IT WILL HAUNT YOU */}
        <div className="bg-background sticky top-0 z-10 shrink-0 flex-col px-3">
          <div className="flex h-(--header-height) items-center justify-between">
            <h2
              className={cn(
                "font-heading",
                "text-base",
                // "font-medium",
              )}
            >
              {title}
            </h2>

            <div className="flex items-center gap-0.5">
              {canCreate && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setCreateDialogOpen(true)
                  }}
                  title={createLabel}
                >
                  <icon.Add className="size-4" />
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm">
                      {sortMode === "name" ? (
                        sortDirection === "asc" ? (
                          <icon.SortAlphabeticalAscending className="size-4" />
                        ) : (
                          <icon.SortAlphabeticalDescending className="size-4" />
                        )
                      ) : sortDirection === "asc" ? (
                        <icon.SortNumericAscending className="size-4" />
                      ) : (
                        <icon.SortNumericDescending className="size-4" />
                      )}
                    </Button>
                  }
                />

                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    closeOnClick={false}
                    onClick={() => {
                      if (sortMode === "name") {
                        onSortChange(
                          "name",
                          sortDirection === "asc" ? "desc" : "asc",
                        )
                      } else {
                        onSortChange("name", "asc")
                      }
                    }}
                  >
                    <icon.SortAlphabeticalAscending className="size-4" />
                    {t("sortByName")}

                    {sortMode === "name" && (
                      <span className="text-muted-foreground text-xs">
                        {sortDirection === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    closeOnClick={false}
                    onClick={() => {
                      if (sortMode === "count") {
                        onSortChange(
                          "count",
                          sortDirection === "asc" ? "desc" : "asc",
                        )
                      } else {
                        onSortChange("count", "desc")
                      }
                    }}
                  >
                    <icon.SortNumericAscending className="size-4" />
                    {t("sortByCount")}

                    {sortMode === "count" && (
                      <span className="text-muted-foreground text-xs">
                        {sortDirection === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <SidebarItemList
          items={items}
          selectedKey={selectedKey}
          onItemClick={onItemClick}
          onHoverItem={handleHoverItem}
          onCancelHover={cancelHoverItem}
          isLoading={isLoading}
          entityType={entityType}
          itemSelection={itemSelection}
          onOpenItemMenu={handleOpenItemMenu}
          menuTarget={menuTarget}
          isItemLocked={isItemLocked}
        />

        <div className="bg-background sticky bottom-0 z-10 mt-auto shrink-0 px-3 pt-2 pb-2">
          <SearchInput
            placeholder={t("search")}
            value={search}
            onChange={onSearchChange}
            className="h-8! shrink-0"
          />
        </div>

        <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpen}>
          <DropdownMenuContent
            align="end"
            className="min-w-40"
            anchor={menuAnchor}
          >
            {entityType && menuTarget && !isItemLocked?.(menuTarget) && (
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => {
                  handleEditItem(menuTarget)
                  // setMenuOpen(false)
                }}
              >
                <icon.Edit className="mr-2 h-4 w-4" />
                {c("actions.edit")}
              </DropdownMenuItem>
            )}

            {canPin && menuTarget && (
              <DropdownMenuItem
                onClick={() => {
                  handlePinItem(menuTarget)
                  setMenuOpen(false)
                }}
              >
                <icon.BookmarkPlus className="mr-2 h-4 w-4" />
                {t("pinAsShelf")}
              </DropdownMenuItem>
            )}

            {entityType &&
              menuTarget &&
              !isItemLocked?.(menuTarget) &&
              !(
                entityType === "status" &&
                menuTarget.kind &&
                isWellKnownStatus(menuTarget.kind)
              ) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    closeOnClick={false}
                    onClick={(event) => {
                      rowDeleteAction.confirm(event)
                      // setMenuOpen(false)
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <icon.Trash className="mr-2 h-4 w-4" />
                    {c("actions.delete")}
                  </DropdownMenuItem>
                </>
              )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ConfirmDialog {...rowDeleteAction.dialogProps} />

        {entityType && (
          <EntityEditDialog
            entityType={entityType}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            item={editItem}
          />
        )}

        {canCreate && entityType && (
          <EntityCreateDialog
            entityType={entityType}
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
          />
        )}
      </div>

      {entityType && entityType !== "status" && (
        <SidebarEntityActions
          entityType={entityType}
          selectedItems={itemSelection.selectedItems}
          allItems={items}
          onStopSelecting={itemSelection.stopSelecting}
          onEdit={handleEditItem}
          toShelfFilter={toShelfFilter}
          isItemLocked={isItemLocked}
        />
      )}
    </div>
  )
}

function SidebarItemList({
  items,
  selectedKey,
  onItemClick,
  onHoverItem,
  onCancelHover,
  isLoading,
  entityType,
  itemSelection,
  onOpenItemMenu,
  menuTarget,
  isItemLocked,
}: {
  items: FacetValue[]
  selectedKey: string | null
  onItemClick: (key: string) => void
  onHoverItem?: (key: string) => void
  onCancelHover?: () => void
  isLoading: boolean
  entityType?: LibraryEntityType | undefined
  itemSelection?: ReturnType<typeof useItemSelection>
  onOpenItemMenu?: (item: FacetValue, anchor: HTMLElement) => void
  menuTarget?: FacetValue | null
  isItemLocked?: ((item: FacetValue) => boolean) | undefined
}) {
  const isSelecting = itemSelection?.isSelecting ?? false
  const canSelect = !!entityType && !!itemSelection
  const hasRowActions = !!onOpenItemMenu && !!entityType

  // the visible order, used to resolve shift-click ranges
  const orderedKeys = useMemo(() => items.map((item) => item.key), [items])

  // store unstable callback references so SidebarRow doesn't receive
  // new function identities on every parent re-render
  const callbacksRef = useRef({
    onItemClick,
    onHoverItem,
    onCancelHover,
    onOpenItemMenu,
    itemSelection,
    orderedKeys,
    menuTarget,
  })
  callbacksRef.current = {
    onItemClick,
    onHoverItem,
    onCancelHover,
    onOpenItemMenu,
    itemSelection,
    orderedKeys,
    menuTarget,
  }

  const c = useCommon()

  const handleRowClick = useCallback((key: string) => {
    callbacksRef.current.onItemClick(key)
  }, [])

  const handleRowHover = useCallback((key: string) => {
    callbacksRef.current.onHoverItem?.(key)
  }, [])

  const handleRowHoverLeave = useCallback(() => {
    callbacksRef.current.onCancelHover?.()
  }, [])

  const handleRowToggle = useCallback((key: string) => {
    callbacksRef.current.itemSelection?.toggleItem(key)
  }, [])

  const handleRowSelectRange = useCallback((key: string) => {
    const { itemSelection: sel, orderedKeys: keys } = callbacksRef.current
    sel?.selectRange(key, keys)
  }, [])

  const handleRowMenu = useCallback((item: FacetValue, anchor: HTMLElement) => {
    callbacksRef.current.onOpenItemMenu?.(item, anchor)
  }, [])

  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // callback ref so the scroll parent is found when the list actually mounts
  // (not during the loading skeleton phase when the container isn't in the DOM)
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return

    const parent = findScrollParent(node)
    setScrollElement(parent)

    if (parent) {
      setScrollMargin(node.offsetTop)
    }
  }, [])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    // 1px gap
    estimateSize: () => SIDEBAR_ROW_HEIGHT + 1,
    overscan: 15,
    scrollMargin,
  })

  if (isLoading) {
    const widths = [60, 45, 72, 50, 38, 65, 55, 42, 68, 48, 58, 44]

    return (
      <div className="flex flex-col gap-0.5 px-2 py-1">
        {widths.map((w, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-md px-2 py-1.5"
          >
            <div
              className="bg-muted/60 h-4 animate-pulse rounded"
              style={{ width: `${w}%` }}
            />
            <div className="bg-muted/40 h-4 w-6 animate-pulse rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-muted-foreground px-4 py-8 text-center text-sm">
        {c("empty.noItemsFound")}
      </div>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className="px-2">
      <div
        ref={containerRef}
        className="relative px-2 py-1"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]
          if (!item) return null

          return (
            <div
              key={item.key}
              className="absolute top-0 left-0 w-full"
              style={{
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <SidebarRow
                item={item}
                isActive={item.key === selectedKey}
                isChecked={itemSelection?.isSelected(item.key) ?? false}
                isSelecting={isSelecting}
                isLocked={isItemLocked?.(item) ?? false}
                canSelect={canSelect && item.key !== NONE_KEY}
                hasRowActions={hasRowActions && item.key !== NONE_KEY}
                onItemClick={handleRowClick}
                onHover={handleRowHover}
                onHoverLeave={handleRowHoverLeave}
                onToggle={handleRowToggle}
                onSelectRange={handleRowSelectRange}
                onOpenMenu={handleRowMenu}
                isMenuTarget={menuTarget?.key === item.key}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SidebarRow({
  item,
  isActive,
  isChecked,
  isSelecting,
  isLocked,
  canSelect,
  hasRowActions,
  isMenuTarget,
  onItemClick,
  onHover,
  onHoverLeave,
  onToggle,
  onSelectRange,
  onOpenMenu,
}: {
  item: FacetValue
  isActive: boolean
  isChecked: boolean
  isSelecting: boolean
  isLocked: boolean
  canSelect: boolean
  hasRowActions: boolean
  isMenuTarget: boolean
  onItemClick: (key: string) => void
  onHover: (key: string) => void
  onHoverLeave: () => void
  onToggle: (key: string) => void
  onSelectRange: (key: string) => void
  onOpenMenu: (item: FacetValue, anchor: HTMLElement) => void
}) {
  const pathname = usePathname()
  const firstPathSegment = pathname.split("/")[1]
  const { selectedBookUuid } = useBookInSidePanel()

  if (!firstPathSegment) return null

  return (
    <div
      className={cn(
        "group/item relative flex items-center rounded-sm",
        isActive
          ? // ATKINS ? "bg-facet-accent text-facet-accent-foreground"
            "text-facet-accent-foreground"
          : "hover:bg-facet-accent/50",
      )}
    >
      <V3Link
        href={`/${firstPathSegment}?item=${item.key}${selectedBookUuid ? `&book=${selectedBookUuid}` : ""}`}
        onPointerEnter={() => {
          onHover(item.key)
        }}
        onPointerLeave={onHoverLeave}
        onClick={(e) => {
          e.preventDefault()
          if (canSelect && e.shiftKey) {
            window.getSelection()?.empty()
            onSelectRange(item.key)
            return
          }

          if (isSelecting && canSelect) {
            onToggle(item.key)
            return
          }

          onItemClick(item.key)
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm",
          canSelect ? "pr-2 pl-1.5" : "px-2",
          isActive && "font-medium",
        )}
      >
        {item.icon ? (
          <DynamicIcon
            iconId={item.icon}
            color={item.color}
            className="size-4 shrink-0"
          />
        ) : item.color ? (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
        ) : null}
        <span className="min-w-0 truncate">{item.name}</span>

        {(isLocked || (item.kind && isWellKnownStatus(item.kind))) && (
          <icon.Lock className="text-muted-foreground/60 size-3 shrink-0" />
        )}
      </V3Link>

      <div className="flex shrink-0 items-center gap-1 pr-2">
        {hasRowActions && !isSelecting && (
          <button
            type="button"
            onClick={(e) => {
              onOpenMenu(item, e.currentTarget)
            }}
            className={cn(
              "text-muted-foreground hover:text-foreground pointer-events-none hidden rounded p-0.5 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:block group-hover/item:opacity-100 peer-focus/item:pointer-events-auto peer-focus/item:block peer-focus/item:opacity-100 focus-visible:opacity-100",
              isMenuTarget && "visible block opacity-100",
            )}
          >
            <icon.DotsVertical className="size-3.5" />
          </button>
        )}

        {canSelect && (
          <SelectionCheckbox
            showCheckbox
            checked={isChecked}
            onSelectRange={onSelectRange}
            onToggle={onToggle}
            // yeah yeah
            uuid={item.key as UUID}
            isSelecting={isSelecting}
            className={cn(
              "group-focus-within:block! group-focus-within:opacity-100! group-hover/item:block! group-hover/item:opacity-100!",
              !isSelecting && "hidden",
            )}
          />
        )}

        <span
          className={cn(
            "text-muted-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums",
            isActive && "text-facet-accent-foreground/80",
            isSelecting && "hidden",
            hasRowActions && !isSelecting && "group-hover/item:hidden",
          )}
        >
          {item.bookCount}
        </span>
      </div>
    </div>
  )
}
