"use client"

import { User } from "@/apiModels"
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
  collectionCreate: false,
}

export const CurrentUserContext = createContext<User | null>(null)

type Props = {
  value: User | null
  children: ReactNode
}

export function CurrentUserProvider({ value, children }: Props) {
  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}

export function useCurrentUser(): User | null {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return useContext(CurrentUserContext)!
}

export function usePermissions(): UserPermissionSet {
  return useContext(CurrentUserContext)?.permissions ?? EMPTY_PERMISSIONS
}

export function usePermission<K extends keyof UserPermissionSet>(
  permission: K,
): boolean {
  const userPermissions = usePermissions()
  return userPermissions[permission]
}
