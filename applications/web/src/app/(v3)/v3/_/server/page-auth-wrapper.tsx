import { forbidden } from "next/navigation"
import type React from "react"

import { assertAuthenticatedUser } from "@/auth/auth"
import { type Permission, type UserWithPermissions } from "@/database/users"

export function withPageAuth<
  T extends {
    params?: Promise<Record<string, unknown>>
    searchParams?: Promise<Record<string, unknown>> | undefined
  },
>(permissions: Permission[]) {
  return (
      page: (
        props: T,
        user: UserWithPermissions,
      ) => Promise<React.ReactNode> | React.ReactNode,
    ) =>
    async (props: T) => {
      const user = await assertAuthenticatedUser()

      const hasPermission = permissions.every(
        (permission) => user.permissions[permission],
      )

      if (!hasPermission) {
        return forbidden()
      }

      return page(props, user)
    }
}
