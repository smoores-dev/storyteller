import { Permission } from "@/database/users"
import { useGetCurrentUserQuery } from "@/store/api"

export function usePermission(permission: Permission) {
  const { hasPermission } = useGetCurrentUserQuery(undefined, {
    selectFromResult: (result) => ({
      hasPermission: result.data?.permissions?.[permission],
    }),
  })
  return hasPermission
}
