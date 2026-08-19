"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { Input } from "@v3/_/components/ui/input"
import { apiErrorMessage } from "@v3/_/lib/api-error"

import { type ShelfFilterNode, type ShelfOrderBy } from "@/shelves"
import { type SortField } from "@/sort"
import { useCreateUserShelfMutation } from "@/store/api"

function toShelfOrderBy(field: SortField): ShelfOrderBy {
  return field === "seriesPosition" ? "position" : field
}

type SaveAsShelfDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  filter: ShelfFilterNode
  sortField: SortField
  sortDirection: "asc" | "desc"
}

export function SaveAsShelfDialog({
  open,
  onOpenChange,
  filter,
  sortField,
  sortDirection,
}: SaveAsShelfDialogProps) {
  const [name, setName] = useState("")
  const [createShelf, { isLoading }] = useCreateUserShelfMutation()

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) return

    try {
      await createShelf({
        name: trimmed,
        description: null,
        filter,
        orderBy: toShelfOrderBy(sortField),
        orderDirection: sortDirection,
        limitCount: null,
        books: [],
      }).unwrap()
      toast.success(`Saved "${trimmed}" as a shelf`)
      setName("")
      onOpenChange(false)
    } catch (error) {
      toast.error("Failed to save shelf", {
        description: apiErrorMessage(error),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as shelf</DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          placeholder="Shelf name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave()
          }}
        />

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              void handleSave()
            }}
            disabled={!name.trim() || isLoading}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
