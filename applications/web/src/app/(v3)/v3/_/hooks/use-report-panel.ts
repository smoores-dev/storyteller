"use no memo" // setFunctions from useQueryState always rerender. this sucks and it hard to optimize for, so we manually memoize them

import { parseAsBoolean, useQueryState } from "nuqs"
import { useCallback } from "react"

export function useReportPanel() {
  const [reportMode, setReportModeRaw] = useQueryState(
    "report",
    parseAsBoolean.withDefault(false),
  )

  const setReportMode = useCallback(
    (value: boolean) => setReportModeRaw(value),
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return { reportMode, setReportMode }
}
