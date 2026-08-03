import { useHotkeys } from "@tanstack/react-hotkeys"
import { type ReactNode, useMemo, useRef, useState } from "react"

import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { type BookFiltersController } from "@v3/_/hooks/use-book-filters"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { ShelfFilterEditor } from "@/app/(v3)/v3/_/components/shelves/ShelfFilterEditor"
import * as icon from "@/icons"
import { type ShelfFilterNode } from "@/shelves"
import { type DisplayField, type SortField } from "@/sort"
import { type BookLayout } from "@/store/slices/uiSettingsSlice"

import { DisplayControl } from "./DisplayControl"
import { FilterControl } from "./FilterControl"
import { FilterChip } from "./RelationshipDropdownMenu"
import { SaveAsShelfDialog } from "./SaveAsShelfDialog"
import { SearchInput } from "./SearchInput"
import { SortControl } from "./SortControl"

export type { SortDirection, SortField } from "@/sort"

type BookFiltersProps = {
  controller: BookFiltersController
  seedLabel?: string
  className?: string

  sortOptions: { value: SortField; label: string }[]
  onSortChange: (field: SortField, direction: "asc" | "desc") => void

  // display fields shown below covers. overrides null = auto; currentFields is
  // the resolved set (auto or manual) so the menu can seed a toggle from it.
  displayOverrides: DisplayField[] | null
  onDisplayOverridesChange: (fields: DisplayField[] | null) => void
  currentFields: DisplayField[]

  // the advanced (shelf-tree) editor + save-as-shelf. on by default so every
  // book list gets them; opt out for contexts where saving makes no sense.
  enableAdvanced?: boolean

  // when set, the layout toggle is hidden and the display control reflects
  // the forced layout instead of the global preference
  forceLayout?: BookLayout

  children?: ReactNode
}

const searchHotKey = "/" as const
const advancedHotKey = "Shift+F" as const
const saveAsShelfHotKey = "Alt+Shift+S" as const
const searchShortcut = [searchHotKey]

function countConditions(node: ShelfFilterNode): number {
  if (node.type === "condition") return 1
  if (node.type === "not") return countConditions(node.child)
  return node.children.reduce((n, child) => n + countConditions(child), 0)
}

export function BookFilters({
  controller,
  seedLabel,
  className,
  sortOptions,
  onSortChange,
  displayOverrides,
  onDisplayOverridesChange,
  currentFields,
  enableAdvanced = true,
  forceLayout,
  children,
}: BookFiltersProps) {
  const t = useTranslation("BooksPage")

  const {
    search,
    setSearch,
    sort,
    isAdvanced,
    activeFields,
    conditionsForField,
    setConditionsForField,
    removeField,
    userFilter,
    setUserFilter,
    effectiveFilter,
  } = controller

  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false)
  // undefined = follow the filter shape (auto-open when the url filter is
  // already advanced); true/false = the user's explicit choice.
  const [advancedOverride, setAdvancedOverride] = useState<boolean | undefined>(
    undefined,
  )
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const advancedVisible = enableAdvanced && (advancedOverride ?? isAdvanced)

  const advancedChip = isAdvanced && !advancedVisible
  const hasChips = !!seedLabel || activeFields.length > 0 || advancedChip
  const canSaveAsShelf =
    enableAdvanced &&
    !!effectiveFilter &&
    (activeFields.length > 0 || advancedChip)

  const toggleAdvanced = () => {
    setAdvancedOverride((prev) => !(prev ?? isAdvanced))
  }

  useHotkeys([
    {
      hotkey: searchHotKey,
      callback: () => {
        searchRef.current?.focus()
      },
    },
    {
      hotkey: advancedHotKey,
      callback: () => {
        if (enableAdvanced) toggleAdvanced()
      },
    },
    {
      hotkey: saveAsShelfHotKey,
      callback: () => {
        if (canSaveAsShelf) setSaveDialogOpen(true)
      },
    },
  ])

  const advancedCount = useMemo(
    () => (isAdvanced ? countConditions(userFilter) : 0),
    [isAdvanced, userFilter],
  )

  return (
    <div
      // DONT MAKE FLEX CONTAINER THE SEARCH INPUT WILL NOT BE THE CORRECT HEIGHT IT WILL HAUNT YOU
      // panel-open tracking comes from PageMain's --panel-reveal rule, not here
      // TODO: do something more interesting on scroll
      className={cn(
        "bg-background sticky top-0 z-30 -mx-1 space-y-2 px-1 pb-2 pl-0",
        className,
      )}
    >
      <div className="flex h-8 items-center gap-1.5">
        <SearchInput
          placeholder={t("seachBooksPlaceholder")}
          ref={searchRef}
          value={search}
          onChange={setSearch}
          shortcut={searchShortcut}
          className="h-8"
        />

        {!isAdvanced && (
          <FilterControl
            open={filterMenuOpen}
            onOpenChange={setFilterMenuOpen}
            conditionsForField={conditionsForField}
            setConditionsForField={setConditionsForField}
            advancedVisible={advancedVisible}
            onToggleAdvanced={enableAdvanced ? toggleAdvanced : undefined}
          />
        )}

        <SortControl
          options={sortOptions}
          field={sort.field}
          direction={sort.direction}
          onChange={onSortChange}
          onReset={controller.resetSort}
          canReset={controller.canResetSort}
          onOpenChange={setSortMenuOpen}
          open={sortMenuOpen}
        />

        <DisplayControl
          displayOverrides={displayOverrides}
          onDisplayOverridesChange={onDisplayOverridesChange}
          currentFields={currentFields}
          open={displayMenuOpen}
          onOpenChange={setDisplayMenuOpen}
          forceLayout={forceLayout}
        />
      </div>

      {hasChips && (
        <div className="scroll-x flex items-center gap-1.5">
          {seedLabel && (
            <span className="border-border bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
              {seedLabel}
            </span>
          )}

          {advancedChip && (
            <button
              className="border-primary/30 bg-primary/10 text-primary inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              onClick={() => {
                setAdvancedOverride(true)
              }}
            >
              <icon.AdjustmentsHorizontal className="h-3 w-3" />
              {t.plain("filters.advancedSummary", { count: advancedCount })}
            </button>
          )}

          {!isAdvanced &&
            activeFields.map((field) => (
              <FilterChip
                key={field}
                field={field}
                conditions={conditionsForField(field)}
                onChange={(next) => {
                  setConditionsForField(field, next)
                }}
                onRemove={() => {
                  removeField(field)
                }}
              />
            ))}

          {canSaveAsShelf && (
            <TooltipButton
              variant="outline"
              size="sm"
              className="ml-auto h-7 shrink-0 gap-1.5 rounded-full text-xs font-medium"
              tooltip={t("filters.saveAsShelf")}
              aria-label={t.plain("filters.saveAsShelf")}
              shortcut={[saveAsShelfHotKey]}
              onClick={() => {
                setSaveDialogOpen(true)
              }}
            >
              <icon.BookmarkPlus className="size-3.5" />
              {t("filters.saveAsShelf")}
            </TooltipButton>
          )}
        </div>
      )}

      {advancedVisible && (
        <div className="border-border border-t pt-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-muted-foreground text-xs font-medium">
              {t("filters.advanced")}
            </span>
            <TooltipButton
              variant="ghost"
              size="icon-sm"
              tooltip={t("filters.closeAdvanced")}
              aria-label={t.plain("filters.closeAdvanced")}
              shortcut={[advancedHotKey]}
              onClick={() => {
                setAdvancedOverride(false)
              }}
            >
              <icon.ChevronUp className="size-4" />
            </TooltipButton>
          </div>
          <ShelfFilterEditor filter={userFilter} onChange={setUserFilter} />
        </div>
      )}

      {effectiveFilter && (
        <SaveAsShelfDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          filter={effectiveFilter}
          sortField={sort.field}
          sortDirection={sort.direction}
        />
      )}

      {children}
    </div>
  )
}
