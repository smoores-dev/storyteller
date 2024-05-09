import { useFocusEffect } from "expo-router"
import { useState } from "react"

export function useIsFocused() {
  const [isFocused, setIsFocused] = useState(true)

  useFocusEffect(() => {
    setIsFocused(true)

    return () => {
      setIsFocused(false)
    }
  })

  return isFocused
}
