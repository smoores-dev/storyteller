import { useCallback, useEffect } from "react"

import { useAppDispatch, useAppSelector } from "@/store/appState"
import { useListServersQuery } from "@/store/localApi"
import { serverApi } from "@/store/serverApi"

export function useListAllServerBooks() {
  const dispatch = useAppDispatch()
  const { data: servers } = useListServersQuery()

  const isLoading = useAppSelector((state) => {
    if (!servers?.length) return false

    return servers.reduce((acc, server) => {
      return (
        acc &&
        serverApi.endpoints.listBooks.select({ serverUuid: server.uuid })(state)
          .isLoading
      )
    }, true)
  })

  const listAllServerBooks = useCallback(
    ({ forceRefetch }: { forceRefetch: boolean }) => {
      if (!servers) return

      for (const server of servers) {
        dispatch(
          serverApi.endpoints.listBooks.initiate(
            { serverUuid: server.uuid },
            { forceRefetch: forceRefetch },
          ),
        )
      }
    },
    [dispatch, servers],
  )

  useEffect(() => {
    listAllServerBooks({ forceRefetch: false })
  }, [listAllServerBooks])

  return {
    refetch: () => listAllServerBooks({ forceRefetch: true }),
    isLoading,
  }
}
