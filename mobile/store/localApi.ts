import { createApi } from "@reduxjs/toolkit/query/react"
import deepmerge from "deepmerge"
import * as SecureStore from "expo-secure-store"

import { type HighlightTint } from "@/colors"
import {
  getBookPreferences,
  updateBookPreference,
} from "@/database/bookPreferences"
import {
  type Bookmark,
  createBookmark,
  deleteBookmarks,
  getBookBookmarks,
} from "@/database/bookmarks"
import {
  type BookWithRelations,
  addBookToDownloadQueue,
  bookQuery,
  deleteBook,
  getBook,
  getBooks,
  removeBookDownloads,
  updateBookStatus,
} from "@/database/books"
import {
  type Collection,
  getCollection,
  getCollections,
} from "@/database/collections"
import { camelCaseRows } from "@/database/converters/camel"
import { parseArray } from "@/database/converters/json"
import { type Creator, getCreator } from "@/database/creators"
import { rawDb } from "@/database/db"
import {
  type Highlight,
  createHighlight,
  deleteHighlight,
  getBookHighlights,
  getHighlight,
  updateHighlight,
} from "@/database/highlights"
import { updateBookPosition } from "@/database/positions"
import {
  getPreferences,
  updatePreference,
  updatePreferences,
} from "@/database/preferences"
import {
  type BookPreferences,
  type Preferences,
} from "@/database/preferencesTypes"
import { type Series, getSeries } from "@/database/series"
import {
  type Server,
  createServer,
  deleteServer,
  getServer,
  getServers,
} from "@/database/servers"
import { type Status, getStatus, getStatuses } from "@/database/statuses"
import { type Tag, getTag } from "@/database/tags"
import { type ReadiumLocator } from "@/modules/readium/src/Readium.types"
import { type UUID } from "@/uuid"

import { deleteLocalBookFiles } from "./persistence/files"

export const localApi = createApi({
  reducerPath: "localApi",
  baseQuery: () => ({
    data: null,
  }),
  tagTypes: [
    "Books",
    "Highlights",
    "Bookmarks",
    "BookPreferences",
    "Preferences",
    "Servers",
    "ServerAccessTokens",
    "Collections",
    "Creators",
    "Series",
    "Tags",
  ],
  endpoints: (build) => ({
    getServerAccessToken: build.query<string | null, { serverUuid: UUID }>({
      async queryFn({ serverUuid }) {
        return {
          data: await SecureStore.getItemAsync(`server.${serverUuid}.token`),
        }
      },
      providesTags: (_, _err, { serverUuid }) => [
        { type: "ServerAccessTokens", id: serverUuid },
      ],
    }),
    listBooks: build.query<BookWithRelations[], void>({
      async queryFn() {
        return { data: await getBooks() }
      },
      onCacheEntryAdded: async (
        _,
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) => {
        try {
          await cacheDataLoaded
        } catch {
          // no-op in case `cacheEntryRemoved` resolves before `cacheDataLoaded`,
          // in which case `cacheDataLoaded` will throw
        }

        const query = bookQuery().compile()
        const unsubscribe = rawDb.reactiveExecute({
          query: query.sql,
          arguments: query.parameters as unknown[],
          fireOn: [
            {
              table: "book",
            },
            {
              table: "creator",
            },
            {
              table: "series",
            },
            {
              table: "collection",
            },
            {
              table: "status",
            },
            {
              table: "position",
            },
            {
              table: "ebook",
            },
            {
              table: "audiobook",
            },
            {
              table: "readaloud",
            },
          ],
          callback(result) {
            updateCachedData(() => {
              return camelCaseRows(parseArray(result.rows))
            })
          },
        })

        await cacheEntryRemoved

        unsubscribe()
      },
    }),
    getBook: build.query<BookWithRelations | null, { uuid: UUID }>({
      async queryFn({ uuid }) {
        return { data: await getBook(uuid) }
      },
      providesTags: (result) =>
        result ? [{ type: "Books", id: result.uuid }] : [],
    }),
    downloadBook: build.mutation<
      null,
      { bookUuid: UUID; format: "ebook" | "audiobook" | "readaloud" }
    >({
      async queryFn({ bookUuid, format }) {
        await addBookToDownloadQueue(bookUuid, format)

        return { data: null }
      },
      invalidatesTags: ["Books"],
    }),
    deleteBook: build.mutation<
      null,
      {
        bookUuid: UUID
        format?: "ebook" | "readaloud" | "audiobook"
        deleteRecord?: boolean
      }
    >({
      async queryFn({ bookUuid, format, deleteRecord = false }) {
        if (deleteRecord) {
          await deleteBook(bookUuid)
        } else {
          await removeBookDownloads(bookUuid, format)
        }

        await deleteLocalBookFiles(bookUuid, format)

        return { data: null }
      },
      invalidatesTags: ["Books"],
    }),
    getBookPreferences: build.query<BookPreferences, { uuid: UUID }>({
      async queryFn({ uuid }) {
        return { data: await getBookPreferences(uuid) }
      },
      providesTags: (_result, _error, { uuid }) => [
        { type: "BookPreferences", id: uuid },
      ],
    }),
    updateBookPreference: build.mutation<
      null,
      {
        bookUuid: UUID
        name: keyof BookPreferences
        value: BookPreferences[keyof BookPreferences]
      }
    >({
      async queryFn({ bookUuid, name, value }) {
        await updateBookPreference(bookUuid, name, value)
        return { data: null }
      },
      invalidatesTags: (_result, _error, { bookUuid }) => [
        { type: "BookPreferences", id: bookUuid },
      ],
    }),
    getGlobalPreferences: build.query<Preferences, void>({
      async queryFn() {
        const preferences = await getPreferences()
        return { data: preferences }
      },
      providesTags: () => ["Preferences"],
    }),
    updateGlobalPreference: build.mutation<
      null,
      { name: keyof Preferences; value: Preferences[keyof Preferences] }
    >({
      async queryFn({ name, value }) {
        await updatePreference(name, value)
        return { data: null }
      },
      async onQueryStarted({ name, value }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          localApi.util.updateQueryData(
            "getGlobalPreferences",
            undefined,
            (draft) => {
              if (!draft) return

              return {
                ...draft,
                [name]: value,
              }
            },
          ),
        )

        try {
          await queryFulfilled
        } catch {
          patch.undo()
        }
      },
      invalidatesTags: ["Preferences"],
    }),
    setBookPreferencesAsDefaults: build.mutation<null, { bookUuid: UUID }>({
      async queryFn({ bookUuid }) {
        const bookPreferences = await getBookPreferences(bookUuid)
        const globalPreferences = await getPreferences()
        const updated = deepmerge(globalPreferences, bookPreferences)
        await updatePreferences(updated)
        return { data: null }
      },
      invalidatesTags: ["Preferences"],
    }),
    createHighlight: build.mutation<
      null,
      {
        bookUuid: UUID
        highlightId: UUID
        color: HighlightTint
        locator: ReadiumLocator
      }
    >({
      async queryFn({ bookUuid, highlightId, color, locator }) {
        await createHighlight({
          uuid: highlightId,
          bookUuid,
          color,
          locator: JSON.stringify(locator),
        })
        return { data: null }
      },
      invalidatesTags: ["Highlights"],
    }),
    updateHighlight: build.mutation<
      null,
      { highlightId: UUID; color: HighlightTint }
    >({
      async queryFn({ highlightId, color }) {
        await updateHighlight(highlightId, { color })
        return { data: null }
      },
      invalidatesTags: ["Highlights"],
    }),
    deleteHighlight: build.mutation<null, { uuid: UUID }>({
      async queryFn({ uuid }) {
        await deleteHighlight(uuid)
        return { data: null }
      },
      invalidatesTags: ["Highlights"],
    }),
    getHighlight: build.query<Highlight | null, { uuid: UUID }>({
      async queryFn({ uuid }) {
        return { data: await getHighlight(uuid) }
      },
      providesTags: () => ["Highlights"],
    }),
    getBookHighlights: build.query<Highlight[], { bookUuid: UUID }>({
      async queryFn({ bookUuid }) {
        const highlights = await getBookHighlights(bookUuid)
        return {
          data: highlights.sort((a, b) =>
            compareLocators(a.locator, b.locator),
          ),
        }
      },
      providesTags: () => ["Highlights"],
    }),
    getBookBookmarks: build.query<Bookmark[], { bookUuid: UUID }>({
      async queryFn({ bookUuid }) {
        const bookmarks = await getBookBookmarks(bookUuid)
        return {
          data: bookmarks.sort((a, b) => compareLocators(a.locator, b.locator)),
        }
      },
      providesTags: () => ["Bookmarks"],
    }),
    createBookmark: build.mutation<
      null,
      { uuid: UUID; bookUuid: UUID; locator: ReadiumLocator }
    >({
      async queryFn({ uuid, bookUuid, locator }) {
        await createBookmark({
          uuid,
          bookUuid,
          locator: JSON.stringify(locator),
        })
        return { data: null }
      },
      invalidatesTags: ["Bookmarks"],
    }),
    deleteBookmarks: build.mutation<
      null,
      { bookUuid: UUID; bookmarkUuids: UUID[] }
    >({
      async queryFn({ bookUuid, bookmarkUuids }) {
        await deleteBookmarks(bookUuid, bookmarkUuids)
        return { data: null }
      },
      invalidatesTags: ["Bookmarks"],
    }),
    listStatuses: build.query<Status[], void>({
      async queryFn() {
        return { data: await getStatuses() }
      },
    }),
    updateStatus: build.mutation<null, { bookUuid: UUID; statusUuid: UUID }>({
      async queryFn({ bookUuid, statusUuid }) {
        await updateBookStatus(bookUuid, statusUuid)
        return { data: null }
      },
      async onQueryStarted(
        { bookUuid, statusUuid },
        { dispatch, queryFulfilled },
      ) {
        const status = await getStatus(statusUuid)
        const getBookPatch = dispatch(
          localApi.util.updateQueryData(
            "getBook",
            { uuid: bookUuid },
            (draft) => {
              if (!draft) return

              draft.status = { ...status, dirty: "true" }
            },
          ),
        )

        const listBooksPatch = dispatch(
          localApi.util.updateQueryData("listBooks", undefined, (draft) => {
            const draftBook = draft.find(({ uuid }) => uuid === bookUuid)
            if (!draftBook) return

            draftBook.status = { ...status, dirty: "true" }
          }),
        )

        await queryFulfilled.catch(() => {
          getBookPatch.undo()
          listBooksPatch.undo()
        })
      },
    }),
    updatePosition: build.mutation<
      null,
      { bookUuid: UUID; locator: ReadiumLocator; timestamp: number }
    >({
      async queryFn({ bookUuid, locator, timestamp }) {
        await updateBookPosition(bookUuid, {
          locator: JSON.stringify(locator),
          timestamp,
        })
        return { data: null }
      },
      async onQueryStarted(
        { bookUuid, locator, timestamp },
        { dispatch, queryFulfilled },
      ) {
        const patchResult = dispatch(
          localApi.util.updateQueryData(
            "getBook",
            { uuid: bookUuid },
            (draft) => {
              if (!draft?.position) return

              draft.position.locator = locator
              draft.position.timestamp = timestamp
            },
          ),
        )

        await queryFulfilled.catch(patchResult.undo)
      },
    }),
    createServer: build.mutation<Server, { uuid: UUID; baseUrl: string }>({
      async queryFn({ uuid, baseUrl }) {
        return { data: await createServer({ uuid, baseUrl }) }
      },
      invalidatesTags: ["Servers"],
    }),
    listServers: build.query<Server[], void>({
      async queryFn() {
        return { data: await getServers() }
      },
      providesTags: () => [{ type: "Servers" as const, id: "LIST" }],
    }),
    getServer: build.query<Server, { uuid: UUID }>({
      async queryFn({ uuid }) {
        try {
          return { data: await getServer(uuid) }
        } catch (e) {
          return { error: { error: String(e) } }
        }
      },
      providesTags: (result) =>
        result ? [{ type: "Servers", id: result.uuid }] : [],
    }),
    deleteServer: build.mutation<
      { server: Server; downloadedBooks: UUID[] },
      { uuid: UUID }
    >({
      async queryFn({ uuid }) {
        return { data: await deleteServer(uuid) }
      },
      invalidatesTags: (_res, _err, { uuid }) => [
        { type: "Servers", id: uuid },
        { type: "Servers", id: "LIST" },
        "Books",
      ],
    }),
    listCollections: build.query<Collection[], void>({
      async queryFn() {
        return { data: await getCollections() }
      },
      providesTags: () => [{ type: "Collections", id: "LIST" }],
    }),
    getCollection: build.query<Collection, { uuid: UUID }>({
      async queryFn({ uuid }) {
        return { data: await getCollection(uuid) }
      },
      providesTags: (result) =>
        result ? [{ type: "Collections", id: result.uuid }] : [],
    }),
    getCreator: build.query<Creator, { uuid: UUID }>({
      async queryFn({ uuid }) {
        return { data: await getCreator(uuid) }
      },
      providesTags: (result) =>
        result ? [{ type: "Creators", id: result.uuid }] : [],
    }),
    getSeries: build.query<Series, { uuid: UUID }>({
      async queryFn({ uuid }) {
        return { data: await getSeries(uuid) }
      },
      providesTags: (result) =>
        result ? [{ type: "Series", id: result.uuid }] : [],
    }),
    getTag: build.query<Tag, { uuid: UUID }>({
      async queryFn({ uuid }) {
        return { data: await getTag(uuid) }
      },
      providesTags: (result) =>
        result ? [{ type: "Tags", id: result.uuid }] : [],
    }),
  }),
})

export const {
  useCreateBookmarkMutation,
  useCreateHighlightMutation,
  useCreateServerMutation,
  useDeleteBookMutation,
  useDeleteBookmarksMutation,
  useDeleteHighlightMutation,
  useDeleteServerMutation,
  useDownloadBookMutation,
  useGetBookBookmarksQuery,
  useGetBookHighlightsQuery,
  useGetBookQuery,
  useGetBookPreferencesQuery,
  useGetCollectionQuery,
  useGetCreatorQuery,
  useGetGlobalPreferencesQuery,
  useLazyGetGlobalPreferencesQuery,
  useGetHighlightQuery,
  useGetServerAccessTokenQuery,
  useGetServerQuery,
  useGetSeriesQuery,
  useGetTagQuery,
  useListBooksQuery,
  useListCollectionsQuery,
  useListStatusesQuery,
  useListServersQuery,
  useSetBookPreferencesAsDefaultsMutation,
  useUpdateBookPreferenceMutation,
  useUpdateGlobalPreferenceMutation,
  useUpdateHighlightMutation,
  useUpdateStatusMutation,
} = localApi

function compareLocators(a: ReadiumLocator, b: ReadiumLocator) {
  if (a.locations?.totalProgression === undefined) {
    return -1
  }
  if (b.locations?.totalProgression === undefined) {
    return 1
  }
  const totalComp = a.locations.totalProgression - b.locations.totalProgression
  if (totalComp !== 0) {
    return totalComp
  }
  return (a.locations.progression ?? 0) - (b.locations.progression ?? 0)
}
