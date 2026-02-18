import {
  type FetchArgs as BaseFetchArgs,
  createApi,
  fetchBaseQuery,
} from "@reduxjs/toolkit/query/react"
import * as SecureStore from "expo-secure-store"

import { type BookWithRelations } from "@storyteller-platform/web/src/database/books"
import { type Position } from "@storyteller-platform/web/src/database/positions"
import { type Status } from "@storyteller-platform/web/src/database/statuses"

import { upsertServerBooks } from "@/database/serverBooks"
import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"
import { type UUID } from "@/uuid"

import { localApi } from "./localApi"

interface FetchArgs extends BaseFetchArgs {
  serverUuid: UUID
}

export const serverApi = createApi({
  reducerPath: "serverApi",
  async baseQuery(
    args: FetchArgs,
    baseQueryApi,
    extraOptions?: { auth?: boolean },
  ) {
    const serverUuid = args.serverUuid
    const { data: servers = [] } = await baseQueryApi.dispatch(
      localApi.endpoints.listServers.initiate(),
    )

    const server = servers.find((server) => server.uuid === serverUuid)

    if (!server) {
      throw new Error("Failed to make server request, no server configured")
    }

    const makeRequest = fetchBaseQuery({
      baseUrl: new URL("/api/v2", server.baseUrl).toString(),
      async prepareHeaders(headers) {
        if (extraOptions?.auth === false) return

        const accessToken = await SecureStore.getItemAsync(
          `server.${server.uuid}.token`,
        )
        if (!accessToken) return

        headers.set("Authorization", `Bearer ${accessToken}`)

        return headers
      },
      // We use token based auth on mobile. We want to
      // prompt users to log in and produce a mobile app token
      // after upgrading, so we specifically prevent sending
      // cookies, even if there was a valid cookie on
      // device from the v1 auth system
      credentials: "omit",
    })

    return makeRequest(args, baseQueryApi, extraOptions ?? {})
  },
  endpoints: (build) => ({
    listBooks: build.query<BookWithRelations[], { serverUuid: UUID }>({
      query: ({ serverUuid }) => ({ url: "/books", serverUuid }),
    }),
    getBook: build.query<
      BookWithRelations,
      { serverUuid: UUID; bookUuid: UUID }
    >({
      query: ({ bookUuid, serverUuid }) => ({
        url: `/books/${bookUuid}`,
        serverUuid,
      }),
      async onCacheEntryAdded(
        { bookUuid, serverUuid },
        { cacheDataLoaded, dispatch },
      ) {
        const { data: book } = await cacheDataLoaded

        dispatch(
          serverApi.util.updateQueryData(
            "listBooks",
            { serverUuid },
            (draft) => {
              const draftBookIndex = draft.findIndex(
                (book) => book.uuid === bookUuid,
              )
              if (draftBookIndex === -1) {
                draft.push(book)
                return
              }
              draft.splice(draftBookIndex, 1, book)
            },
          ),
        )

        await upsertServerBooks([book], serverUuid)
      },
    }),
    updatePosition: build.mutation<
      null,
      {
        bookUuid: UUID
        serverUuid: UUID
        locator: ReadiumLocator
        timestamp: number
      }
    >({
      query: ({ bookUuid, serverUuid, locator, timestamp }) => ({
        url: `/books/${bookUuid}/positions`,
        serverUuid,
        method: "POST",
        body: {
          locator,
          timestamp,
        },
      }),
    }),
    getPosition: build.query<Position, { bookUuid: UUID; serverUuid: UUID }>({
      query: ({ bookUuid, serverUuid }) => ({
        url: `/books/${bookUuid}/positions`,
        serverUuid,
      }),
    }),
    listStatuses: build.query<Status[], { serverUuid: UUID }>({
      query: ({ serverUuid }) => ({
        url: `/statuses`,
        serverUuid,
      }),
    }),
    updateStatus: build.mutation<
      void,
      { bookUuid: UUID; serverUuid: UUID; statusUuid: UUID }
    >({
      query: ({ bookUuid, serverUuid, statusUuid }) => ({
        url: `/books/${bookUuid}/status`,
        serverUuid,
        method: "PUT",
        body: {
          status: statusUuid,
        },
      }),
    }),
  }),
})

export const { useListBooksQuery, useLazyGetBookQuery } = serverApi

export function getDownloadUrl(
  baseUrl: string,
  bookUuid: string,
  format: "readaloud" | "audiobook" | "ebook",
) {
  const url = new URL(`/api/v2/books/${bookUuid}/files`, baseUrl)
  url.searchParams.append("format", format)
  return url.toString()
}

export function getCoverUrl(
  baseUrl: string,
  bookUuid: string,
  {
    height,
    width,
    audio = false,
  }: { height?: number; width?: number; audio?: boolean } = {},
) {
  const url = new URL(`/api/v2/books/${bookUuid}/cover`, baseUrl)

  if (audio) {
    url.searchParams.append("audio", "true")
  }
  if (height) {
    url.searchParams.append("h", height.toString())
  }
  if (width) {
    url.searchParams.append("w", width.toString())
  }
  return url.toString()
}
