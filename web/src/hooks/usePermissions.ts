import { useGetCurrentUserQuery } from "@/store/api"

export function usePermissions() {
  const { permissions } = useGetCurrentUserQuery(undefined, {
    selectFromResult: (result) => ({
      permissions: result.data?.permissions,
    }),
  })
  return permissions
}
