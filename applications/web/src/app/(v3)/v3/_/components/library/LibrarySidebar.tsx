"use client"

import { useVirtualizer } from "@tanstack/react-virtual"
import { usePathname } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

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
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@v3/_/components/ui/sidebar"
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
import { useSidebarVisibility } from "@v3/_/hooks/use-sidebar-visibility"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { apiErrorMessage } from "@v3/_/lib/api-error"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { type ShelfFilterNode } from "@/shelves"
import { type UUID } from "@/uuid"

const SIDEBAR_ROW_HEIGHT = 32

// row affordances appear on hover, or on keyboard focus, but never on plain
// focus (a clicked row keeps focus and would leave them stuck on screen)
const REVEAL_ON_HOVER =
  "md:opacity-0 group-hover/menu-item:opacity-100 group-has-[:focus-visible]/menu-item:opacity-100 data-open:opacity-100 data-popup-open:opacity-100"

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

  // collections and shelves double as app-sidebar rows, so each facet row shows
  // whether it is currently hidden there and can toggle it
  const sidebarItemKind =
    entityType === "collection"
      ? ("collection" as const)
      : entityType === "shelf"
        ? ("shelf" as const)
        : null
  const {
    isHidden,
    setHidden,
    isSaving: isTogglingVisibility,
  } = useSidebarVisibility()

  const isHiddenInSidebar = useCallback(
    (item: FacetValue) =>
      !!sidebarItemKind && item.key !== NONE_KEY && isHidden(item.key),
    [sidebarItemKind, isHidden],
  )

  const handleToggleSidebarVisibility = useCallback(
    (item: FacetValue) => {
      if (!sidebarItemKind) return
      void setHidden(sidebarItemKind, item.key, !isHidden(item.key)).catch(
        (error: unknown) => {
          toast.error(tEntity("sidebarVisibilityFailed"), {
            description: apiErrorMessage(error),
          })
        },
      )
    },
    [sidebarItemKind, setHidden, isHidden, tEntity],
  )

  const handlePinItem = useCallback(
    (item: FacetValue) => {
      if (!toShelfFilter) return
      void pinShelf(item.name, toShelfFilter(item.key))
    },
    [toShelfFilter, pinShelf],
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="scroll-y relative flex min-h-0 flex-1 flex-col">
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
          isItemHiddenInSidebar={
            sidebarItemKind ? isHiddenInSidebar : undefined
          }
        />

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

            {sidebarItemKind && menuTarget && menuTarget.key !== NONE_KEY && (
              <DropdownMenuItem
                disabled={isTogglingVisibility}
                onClick={() => {
                  handleToggleSidebarVisibility(menuTarget)
                  setMenuOpen(false)
                }}
              >
                {isHiddenInSidebar(menuTarget) ? (
                  <>
                    <icon.Eye className="mr-2 h-4 w-4" />
                    {tEntity("showInSidebar")}
                  </>
                ) : (
                  <>
                    <icon.EyeOff className="mr-2 h-4 w-4" />
                    {tEntity("hideFromSidebar")}
                  </>
                )}
              </DropdownMenuItem>
            )}

            {entityType && menuTarget && !isItemLocked?.(menuTarget) && (
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

      <div className="bg-background z-10 shrink-0 px-3 pt-2 pb-2">
        <SearchInput
          placeholder={t("search")}
          value={search}
          onChange={onSearchChange}
          className="h-8! shrink-0"
        />
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
  isItemHiddenInSidebar,
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
  isItemHiddenInSidebar?: ((item: FacetValue) => boolean) | undefined
}) {
  const isSelecting = itemSelection?.isSelecting ?? false
  const canSelect = !!entityType && !!itemSelection
  const hasRowActions = !!onOpenItemMenu && !!entityType

  const orderedKeys = items.map((item) => item.key)

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
  const containerRef = useCallback((node: HTMLUListElement | null) => {
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
    // fixed widths, not SidebarMenuSkeleton's random ones: this renders during
    // SSR too, and a random width hydrates as a mismatch
    const widths = [60, 45, 72, 50, 38, 65, 55, 42, 68, 48, 58, 44]

    return (
      <SidebarMenu className="gap-0.5 px-2 py-1">
        {widths.map((w, i) => (
          <SidebarMenuItem
            key={i}
            className="flex h-8 items-center justify-between"
          >
            <div
              className="bg-muted/60 h-4 animate-pulse rounded"
              style={{ width: `${w}%` }}
            />
            <div className="bg-muted/40 h-4 w-6 animate-pulse rounded-full" />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
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
    <SidebarMenu
      ref={containerRef}
      className="relative shrink-0 gap-0 px-2 py-1"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualItems.map((virtualItem) => {
        const item = items[virtualItem.index]
        if (!item) return null

        return (
          <SidebarRow
            key={item.key}
            item={item}
            style={{
              height: virtualItem.size,
              transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
            }}
            isActive={item.key === selectedKey}
            isChecked={itemSelection?.isSelected(item.key) ?? false}
            isSelecting={isSelecting}
            isLocked={isItemLocked?.(item) ?? false}
            isHiddenInSidebar={isItemHiddenInSidebar?.(item) ?? false}
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
        )
      })}
    </SidebarMenu>
  )
}

function SidebarRow({
  item,
  style,
  isActive,
  isChecked,
  isSelecting,
  isLocked,
  isHiddenInSidebar,
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
  style: React.CSSProperties
  isActive: boolean
  isChecked: boolean
  isSelecting: boolean
  isLocked: boolean
  isHiddenInSidebar: boolean
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
  const tEntity = useTranslation("EntityActions")
  const hiddenLabel = tEntity.plain("hiddenFromSidebar")

  if (!firstPathSegment) return null

  const revealsOnHover = hasRowActions || canSelect

  return (
    <SidebarMenuItem className="absolute top-0 left-0 w-full" style={style}>
      <SidebarMenuButton
        isActive={isActive}
        className={cn(
          "hover:text-facet-accent-foreground active:text-facet-accent-foreground data-active:text-facet-accent-foreground rounded-sm",
          canSelect ? "pr-2 pl-1.5" : "px-2",
        )}
        render={
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

            {isLocked && (
              <icon.Lock className="text-muted-foreground/60 size-3 shrink-0" />
            )}

            {isHiddenInSidebar && (
              <icon.EyeOff
                className="text-muted-foreground/60 size-3 shrink-0"
                aria-label={hiddenLabel}
              />
            )}
          </V3Link>
        }
      />

      {hasRowActions && !isSelecting && (
        <SidebarMenuAction
          onClick={(e) => {
            onOpenMenu(item, e.currentTarget)
          }}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            // sits left of the checkbox when rows are selectable
            canSelect && "right-9",
            // deliberately not focus-within: clicking a row leaves it focused,
            // which would pin the actions open over the count
            REVEAL_ON_HOVER,
            isMenuTarget && "opacity-100",
          )}
        >
          <icon.DotsVertical className="size-3.5" />
        </SidebarMenuAction>
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
            "absolute top-1.5 right-3",
            "group-hover/menu-item:block! group-hover/menu-item:opacity-100! group-has-[:focus-visible]/menu-item:block! group-has-[:focus-visible]/menu-item:opacity-100!",
            !isSelecting && "hidden",
          )}
        />
      )}

      <SidebarMenuBadge
        className={cn(
          "text-muted-foreground peer-hover/menu-button:text-muted-foreground peer-data-active/menu-button:text-facet-accent-foreground/80 rounded-full px-1.5 text-xs",
          isSelecting && "hidden",
          revealsOnHover &&
            !isSelecting &&
            "group-hover/menu-item:hidden group-has-[:focus-visible]/menu-item:hidden",
        )}
      >
        {item.bookCount}
      </SidebarMenuBadge>
    </SidebarMenuItem>
  )
}
