"use client"

import { useCallback } from "react"
import { toast } from "sonner"

import { apiErrorMessage } from "@v3/_/lib/api-error"

import { type ShelfFilterNode } from "@/shelves"
import { useCreateUserShelfMutation } from "@/store/api"

// create a filter-based shelf and pin it to the app sidebar in one go. used by
// the library views to turn any facet (an author, a tag, a series, ...) into a
// saved shelf with a single click.
// the server automatically adds newly created shelves to the sidebar.
export function usePinShelf() {
  const [createShelf, { isLoading: isPinning }] = useCreateUserShelfMutation()

  const pinShelf = useCallback(
    async (name: string, filter: ShelfFilterNode) => {
      try {
        await createShelf({
          name,
          description: null,
          filter,
          orderBy: "createdAt",
          orderDirection: "desc",
          limitCount: null,
          books: [],
        }).unwrap()

        toast.success(`Pinned "${name}" to the sidebar`)
      } catch (error) {
        toast.error("Failed to pin shelf", {
          description: apiErrorMessage(error),
        })
      }
    },
    [createShelf],
  )

  return { pinShelf, isPinning }
}
