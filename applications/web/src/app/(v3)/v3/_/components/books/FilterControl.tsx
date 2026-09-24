import { useHotkeys } from "@tanstack/react-hotkeys"
import { useMemo } from "react"

import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuSeparator,
  FilterableMenuSub,
  FilterableMenuSubContent,
  FilterableMenuSubTrigger,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { type BookFiltersController } from "@v3/_/hooks/use-book-filters"
import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  type FieldGroupKey,
  QUICK_FILTER_FIELDS,
  type QuickFilterField,
  getFieldDef,
} from "@/fields"
import * as icon from "@/icons"
import { FieldIcon } from "@/icons"

import { FilterEditor } from "./RelationshipDropdownMenu"

export const filterHotKey = "F" as const

export function FilterControl({
  open,
  onOpenChange,
  conditionsForField,
  setConditionsForField,
  advancedVisible,
  onToggleAdvanced,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conditionsForField: BookFiltersController["conditionsForField"]
  setConditionsForField: BookFiltersController["setConditionsForField"]
  advancedVisible: boolean
  onToggleAdvanced?: () => void
}) {
  const t = useTranslation("BooksPage")
  const tLabel = useTranslation("Common.fields.label")

  useHotkeys([
    {
      hotkey: filterHotKey,
      callback: () => {
        onOpenChange(true)
      },
    },
  ])

  const groups = useMemo(() => {
    return QUICK_FILTER_FIELDS.reduce(
      (acc, field) => {
        const group = getFieldDef(field).group
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!acc[group]) {
          acc[group] = []
        }
        acc[group].push(field)
        return acc
      },
      {} as Record<FieldGroupKey, QuickFilterField[]>,
    )
  }, [])

  return (
    <FilterableMenu open={open} onOpenChange={onOpenChange}>
      <FilterableMenuTrigger
        render={
          <TooltipButton
            variant="outline"
            // size="icon"
            className="text-muted-foreground hover:text-foreground inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
            tooltip={t("filters.filters")}
            shortcut={[filterHotKey]}
            aria-label={t("filters.filters")}
          >
            <icon.Filter />
          </TooltipButton>
        }
      />
      <FilterableMenuContent searchPlaceholder={t.plain("filters.filters")}>
        {Object.entries(groups).flatMap(([group, fields]) =>
          group !== "alignment" ? (
            fields.map((field) => (
              <FilterableMenuSub key={field}>
                <FilterableMenuSubTrigger
                  icon={<FieldIcon field={field} className="size-4" />}
                  textValue={tLabel.plain(getFieldDef(field).labelKey as never)}
                >
                  {tLabel(getFieldDef(field).labelKey as never)}
                </FilterableMenuSubTrigger>
                <FilterableMenuSubContent searchable>
                  <FilterEditor
                    field={field}
                    def={getFieldDef(field)}
                    conditions={conditionsForField(field)}
                    onChange={(next) => {
                      setConditionsForField(field, next)
                    }}
                    enabled
                  />
                </FilterableMenuSubContent>
              </FilterableMenuSub>
            ))
          ) : (
            <FilterableMenuSub key={group}>
              <FilterableMenuSubTrigger
                icon={<icon.AlignLeft className="size-4" />}
                textValue={tLabel.plain(group)}
              >
                {tLabel.plain(group)}
              </FilterableMenuSubTrigger>
              <FilterableMenuSubContent searchable>
                {fields.map((field) => (
                  <FilterableMenuSub key={field}>
                    <FilterableMenuSubTrigger
                      icon={<FieldIcon field={field} className="size-4" />}
                      textValue={tLabel.plain(
                        getFieldDef(field).labelKey as never,
                      )}
                    >
                      {tLabel(getFieldDef(field).labelKey as never)}
                    </FilterableMenuSubTrigger>
                    <FilterableMenuSubContent>
                      <FilterEditor
                        enabled
                        field={field}
                        def={getFieldDef(field)}
                        conditions={conditionsForField(field)}
                        onChange={(next) => {
                          setConditionsForField(field, next)
                        }}
                      />
                    </FilterableMenuSubContent>
                  </FilterableMenuSub>
                ))}
              </FilterableMenuSubContent>
            </FilterableMenuSub>
          ),
        )}

        {onToggleAdvanced && (
          <>
            <FilterableMenuSeparator />

            <FilterableMenuItem
              textValue={t.plain("filters.advanced")}
              icon={<icon.AdjustmentsHorizontal className="size-4" />}
              onSelect={() => {
                onToggleAdvanced()
              }}
            >
              {t("filters.advanced")}
              {advancedVisible && <icon.Check className="ml-auto" />}
            </FilterableMenuItem>
          </>
        )}
      </FilterableMenuContent>
    </FilterableMenu>
  )
}
