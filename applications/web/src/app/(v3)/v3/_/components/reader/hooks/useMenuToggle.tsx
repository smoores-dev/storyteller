import { useCallback, useState } from "react"

import { useRegisterNavigatorClickhandler } from "./useNavigatorEvents"

export const useMenuToggle = () => {
  const [isOpen, setOpen] = useState(false)

  const closeMenu = useCallback(() => {
    if (!isOpen) return false

    setOpen(false)
    return true
  }, [isOpen])

  const openMenu = useCallback(() => {
    setOpen(true)
  }, [])

  const toggleMenu = useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  useRegisterNavigatorClickhandler(closeMenu, 50)

  return {
    isOpen,
    setOpen,
    openMenu,
    closeMenu,
    toggleMenu,
  }
}
