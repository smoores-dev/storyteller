import { useCallback } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"

import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import { statusDisplayLabel } from "@/database/statusKinds"
import * as icon from "@/icons"
import { useListStatusesQuery, useUpdateStatusMutation } from "@/store/api"

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

  const currentStatus = book.status

  const handleStatusChange = useCallback(
    async (statusUuid: string) => {
      await updateStatus({
        bookUuid: book.uuid,
        statusUuid:
          statusUuid as `${string}-${string}-${string}-${string}-${string}`,
      })
      onStatusChange?.()
    },
    [book.uuid, updateStatus, onStatusChange],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="cover-outline"
            size={size}
            className="gap-2 rounded-xl"
          >
            <icon.BookAlt className="h-4 w-4" />
            {currentStatus ? statusDisplayLabel(currentStatus) : "Set Status"}
            <icon.ChevronDown className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {statuses.map((status) => (
          <DropdownMenuItem
            key={status.uuid}
            onClick={() => handleStatusChange(status.uuid)}
            className={cn(
              String(currentStatus?.uuid) === status.uuid && "bg-accent",
            )}
          >
            {statusDisplayLabel(status)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
