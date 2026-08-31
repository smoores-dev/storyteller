"use no memo" // setFunctions from useQueryState always rerender. this sucks and it hard to optimize for, so we manually memoize them

import { type SingleParser, parseAsString, useQueryState } from "nuqs"
import { useCallback } from "react"

import { type UUID } from "@/uuid"

import { confirmLeave } from "./use-unsaved-changes"

export function useBookInSidePanel() {
  const [selectedBookUuid, setSelectedBookUuidRaw] = useQueryState(
    "book",
    parseAsString as SingleParser<UUID | null>,
  )
  const setSelectedBookUuid = useCallback(
    (uuid: UUID | null) => {
      if (!confirmLeave(() => void setSelectedBookUuidRaw(uuid))) {
        return Promise.resolve(null)
      }
      return setSelectedBookUuidRaw(uuid)
    },
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return { selectedBookUuid, setSelectedBookUuid }
}
