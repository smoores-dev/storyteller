import { useMemo } from "react"

import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuTrigger,
} from "@/app/(v3)/v3/_/components/ui/filterable-menu"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { cn } from "@/cn"
import * as icon from "@/icons"
import { type DisplayField, GENERAL_SORT_FIELDS } from "@/sort"

const PICKABLE_FIELDS: DisplayField[] = [
  ...GENERAL_SORT_FIELDS.filter((f) => f !== "title"),
]

type ColumnSelectorProps = {
  visibleFields: DisplayField[]
  onChange: (fields: DisplayField[]) => void
  className?: string
}

export function ColumnSelector({
  visibleFields,
  onChange,
  className,
}: ColumnSelectorProps) {
  const t = useTranslation("Common.fields")

  const toggle = (field: DisplayField) => {
    if (visibleFields.includes(field)) {
      onChange(visibleFields.filter((f) => f !== field))
    } else {
      onChange([...visibleFields, field])
    }
  }

  const fieldsWithIcons = useMemo(
    () =>
      PICKABLE_FIELDS.map((field) => ({
        field,
        icon: icon.fieldIcon(field),
      })),
    [],
  )

  return (
    <FilterableMenu>
      <FilterableMenuTrigger
        render={
          <TooltipButton
            variant="ghost"
            className={cn("shrink-0 gap-1.5 text-xs font-normal", className)}
            tooltip="Show/hide columns"
            aria-label="Fields"
          >
            <icon.Columns3 className="h-3.5 w-3.5" />
          </TooltipButton>
        }
      />
      <FilterableMenuContent>
        {fieldsWithIcons.map((field) => (
          <FilterableMenuItem
            key={field.field}
            onSelect={() => {
              toggle(field.field)
            }}
            icon={<field.icon className="h-3.5 w-3.5" />}
            textValue={t(`label.${field.field}`)}
            closeOnClick={false}
          >
            {t(`label.${field.field}`)}
          </FilterableMenuItem>
        ))}
      </FilterableMenuContent>
    </FilterableMenu>
  )
}
