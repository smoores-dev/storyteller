"use client"

import { UserPermissionSet } from "@/database/users"
import { ReactNode, createContext, useContext } from "react"

export const EMPTY_PERMISSIONS: UserPermissionSet = {
  bookCreate: false,
  bookRead: false,
  bookProcess: false,
  bookDownload: false,
  bookList: false,
  bookDelete: false,
  bookUpdate: false,
  inviteList: false,
  inviteDelete: false,
  userCreate: false,
  userList: false,
  userRead: false,
  userDelete: false,
  userUpdate: false,
  settingsUpdate: false,
}

export const UserPermissionsContext = createContext(EMPTY_PERMISSIONS)

type Props = {
  value: UserPermissionSet
  children: ReactNode
}

export function UserPermissionsProvider({ value, children }: Props) {
  return (
    <UserPermissionsContext.Provider value={value}>
      {children}
    </UserPermissionsContext.Provider>
  )
}

export function usePermissions(): UserPermissionSet {
  return useContext(UserPermissionsContext)
}

export function usePermission<K extends keyof UserPermissionSet>(
  permission: K,
): boolean {
  const userPermissions = usePermissions()
  return userPermissions[permission]
}
