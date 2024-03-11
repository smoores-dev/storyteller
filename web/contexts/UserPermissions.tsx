"use client"

import { UserPermissions } from "@/apiModels"
import { ReactNode, createContext, useContext } from "react"

export const emptyPermissions: UserPermissions = {
  book_create: false,
  book_read: false,
  book_process: false,
  book_download: false,
  book_list: false,
  book_delete: false,
  book_update: false,
  user_create: false,
  user_list: false,
  user_read: false,
  user_delete: false,
  settings_update: false,
}

export const UserPermissionsContext = createContext(emptyPermissions)

type Props = {
  value: UserPermissions
  children: ReactNode
}

export function UserPermissionsProvider({ value, children }: Props) {
  return (
    <UserPermissionsContext.Provider value={value}>
      {children}
    </UserPermissionsContext.Provider>
  )
}

export function usePermissions(): UserPermissions {
  return useContext(UserPermissionsContext)
}

export function usePermission<K extends keyof UserPermissions>(
  permission: K,
): boolean {
  const userPermissions = usePermissions()
  return userPermissions[permission]
}
