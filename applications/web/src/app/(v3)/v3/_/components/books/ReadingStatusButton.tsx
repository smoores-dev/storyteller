import { useCallback } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { type BookWithRelations } from "@/database/books"
import { statusDisplayLabel } from "@/database/statusKinds"
import * as icon from "@/icons"
import { useListStatusesQuery, useUpdateStatusMutation } from "@/store/api"
import { type UUID } from "@/uuid"

export function ReadingStatusButton({
  book,
  size,
  onStatusChange,
}: {
  book: BookWithRelations
  size?: "sm" | "default" | "lg"
  onStatusChange?: () => void
}) {
  const { data: statuses = [] } = useListStatusesQuery()
  const [updateStatus] = useUpdateStatusMutation()
  const t = useTranslation("BookActions")
  const c = useCommon()

  const currentStatus = book.status

  const handleStatusChange = useCallback(
    async (statusUuid: UUID | null) => {
      await updateStatus({ bookUuid: book.uuid, statusUuid })
      onStatusChange?.()
    },
    [book.uuid, updateStatus, onStatusChange],
  )

  const noneLabel = c.plain("actions.none")

  return (
    <FilterableMenu>
      <FilterableMenuTrigger
        render={
          <Button
            variant="cover-outline"
            size={size}
            className="gap-2 rounded-xl"
          >
            <icon.BookAlt className="h-4 w-4" />
            {currentStatus
              ? statusDisplayLabel(currentStatus)
              : t.plain("setStatus")}
            <icon.ChevronDown className="h-4 w-4" />
          </Button>
        }
      />
      <FilterableMenuContent
        align="end"
        className="w-52"
        searchable={statuses.length > 8}
      >
        {statuses.map((status) => {
          const label = statusDisplayLabel(status)
          return (
            <FilterableMenuItem
              key={status.uuid}
              textValue={label}
              onSelect={() => {
                void handleStatusChange(status.uuid)
              }}
            >
              {label}
              {String(currentStatus?.uuid) === status.uuid && (
                <icon.Check className="ml-auto" />
              )}
            </FilterableMenuItem>
          )
        })}

        <FilterableMenuItem
          textValue={noneLabel}
          onSelect={() => {
            void handleStatusChange(null)
          }}
        >
          <span className="text-muted-foreground">{noneLabel}</span>
          {!currentStatus && <icon.Check className="ml-auto" />}
        </FilterableMenuItem>
      </FilterableMenuContent>
    </FilterableMenu>
  )
}
