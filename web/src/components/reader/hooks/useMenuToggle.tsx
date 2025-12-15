import { useCallback, useState } from "react"

import { useRegisterNavigatorClickhandler } from "./useNavigatorEvents"

/**
 * registers a navigator click handler to close the menu when the user clicks outside the menu
 */
export const useMenuToggle = () => {
  const [isOpen, setOpen] = useState(false)

  const closeMenu = useCallback(() => {
    if (!isOpen) return false

    setOpen(false)
    return true
  }, [isOpen, setOpen])

  const openMenu = useCallback(() => {
    setOpen(true)
  }, [setOpen])

  const toggleMenu = useCallback(() => {
    if (isOpen) {
      closeMenu()
    } else {
      openMenu()
    }
  }, [closeMenu, openMenu, isOpen])

  useRegisterNavigatorClickhandler(closeMenu, 50)

  return {
    isOpen,
    openMenu,
    closeMenu,
    toggleMenu,
  }
}
