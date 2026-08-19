"use client"

import { useCallback } from "react"
import { toast } from "sonner"

import { apiErrorMessage } from "@v3/_/lib/api-error"

import { type ShelfFilterNode } from "@/shelves"
import { useCreateUserShelfMutation } from "@/store/api"

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
