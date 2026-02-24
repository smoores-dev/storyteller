/* eslint-disable @typescript-eslint/no-invalid-void-type */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

import {
  type Invite,
  type InviteRequest,
  type Settings,
  type Shelves,
  type User,
} from "@/apiModels"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  type CreatorRelation,
  type SeriesRelation,
} from "@/database/books"
import { type CollectionWithRelations } from "@/database/collections"
import { type Creator } from "@/database/creators"
import { type Position } from "@/database/positions"
import {
  type NewSeries,
  type NewSeriesRelation,
  type Series,
} from "@/database/series"
import { type Status } from "@/database/statuses"
import { type Tag } from "@/database/tags"
import { type UserPermissionSet } from "@/database/users"
import { type BookEvent } from "@/events"
import { type SeriesWithBooks } from "@/hooks/useFilterSortedSeries"
import { type UUID } from "@/uuid"

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v2" }),
  tagTypes: [
    "Invites",
    "Users",
    "Statuses",
    "Creators",
    "Series",
    "Collections",
    "Tags",
    "CurrentUser",
    "Authors",
    "MaxUploadChunkSize",
    "UserReadingPreferences",
    "UserReadingState",
  ],
  endpoints: (build) => ({
    createInvite: build.mutation<Invite, InviteRequest>({
      query: (inviteRequest) => ({
        url: "/invites",
        method: "POST",
        body: inviteRequest,
      }),
      invalidatesTags: () => ["Invites"],
    }),
    resendInvite: build.mutation<void, { inviteKey: string }>({
      query: ({ inviteKey }) => ({
        url: `/invites/${inviteKey}/send`,
        method: "POST",
      }),
    }),
    deleteInvite: build.mutation<void, { inviteKey: string }>({
      query: ({ inviteKey }) => ({
        url: `/invites/${inviteKey}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { inviteKey }) => [
        { type: "Invites", id: inviteKey },
      ],
    }),
    listInvites: build.query<Invite[], void>({
      query: () => "/invites",
      providesTags: (invites) =>
        invites?.map((invite) => ({
          type: "Invites",
          id: invite.inviteKey,
        })) ?? ["Invites"],
    }),
    listUsers: build.query<User[], void>({
      query: () => "/users",
      providesTags: (users) =>
        users?.map((user) => ({ type: "Users", id: user.id })) ?? ["Users"],
    }),
    deleteUser: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/users/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        { type: "Users", id: uuid },
      ],
    }),
    updateUser: build.mutation<
      void,
      { uuid: UUID; permissions: UserPermissionSet }
    >({
      query: ({ uuid, permissions }) => ({
        url: `/users/${uuid}`,
        method: "PUT",
        body: { permissions },
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        { type: "Users", id: uuid },
      ],
    }),
    getCurrentUser: build.query<User, void>({
      query: () => "/user",
      providesTags: () => ["CurrentUser"],
    }),
    getMaxUploadChunkSize: build.query<
      { maxUploadChunkSize: number | null; overriden: boolean },
      void
    >({
      query: () => "/settings/maxUploadChunkSize",
      providesTags: () => ["MaxUploadChunkSize"],
    }),
    updateSettings: build.mutation({
      query: (settings: Settings) => ({
        url: "/settings",
        method: "PUT",
        body: settings,
      }),
      invalidatesTags: ["MaxUploadChunkSize"],
    }),
    getBook: build.query<BookWithRelations, { uuid: UUID }>({
      query: ({ uuid }) => `/books/${uuid}`,
    }),
    deleteBook: build.mutation<
      void,
      { uuid: UUID; includeAssets?: "all" | "internal" }
    >({
      query: ({ uuid, includeAssets }) => ({
        url: `/books/${uuid}`,
        method: "DELETE",
        params: {
          includeAssets,
        },
      }),
    }),
    deleteBookAssets: build.mutation<void, { uuid: UUID; originals?: boolean }>(
      {
        query: ({ uuid, originals }) => ({
          url: `/books/${uuid}/cache`,
          method: "DELETE",
          params: {
            originals,
          },
        }),
      },
    ),
    deleteBooks: build.mutation<
      void,
      { books: UUID[]; includeAssets?: "all" | "internal" }
    >({
      query: ({ books, includeAssets }) => ({
        url: `/books`,
        method: "DELETE",
        body: {
          books,
          includeAssets,
        },
      }),
    }),
    getPosition: build.query<Position, { uuid: UUID }>({
      query: ({ uuid }) => `/books/${uuid}/positions`,
    }),
    updatePosition: build.mutation<void, { uuid: UUID; position: Position }>({
      query: ({ uuid, position }) => ({
        url: `/books/${uuid}/positions`,
        method: "POST",
        body: position,
      }),
    }),
    getShelves: build.query<Shelves, void>({
      query: () => "/shelves",
    }),
    listBooks: build.query<BookWithRelations[], void>({
      query: () => "/books",
      onCacheEntryAdded: async (
        _,
        // This is safe to use unbound
        /* eslint-disable-next-line @typescript-eslint/unbound-method */
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) => {
        try {
          await cacheDataLoaded
        } catch {
          // no-op in case `cacheEntryRemoved` resolves before `cacheDataLoaded`,
          // in which case `cacheDataLoaded` will throw
        }

        // Handle SSR
        if (typeof EventSource === "undefined") return

        const eventSource = new EventSource("/api/v2/books/events")

        eventSource.addEventListener("message", (m: MessageEvent<string>) => {
          const event = JSON.parse(m.data) as BookEvent
          updateCachedData((draft) => {
            if (event.type === "bookCreated") {
              draft.push(event.payload)
              return
            }

            if (event.type === "bookDeleted") {
              const deletedIndex = draft.findIndex(
                (book) => book.uuid === event.bookUuid,
              )
              draft.splice(deletedIndex, 1)
              return
            }

            draft.forEach((draftBook) => {
              if (draftBook.uuid !== event.bookUuid) return

              switch (event.type) {
                case "bookUpdated": {
                  Object.assign(draftBook, event.payload)
                  return
                }
                default: {
                  return
                }
              }
            })
          })
        })

        await cacheEntryRemoved

        eventSource.close()
      },
    }),
    processBook: build.mutation<
      void,
      { uuid: UUID; restart?: "full" | "transcription" | "sync" | false }
    >({
      query: ({ uuid, restart }) => ({
        url: `/books/${uuid}/process`,
        method: "POST",
        ...(restart && {
          params: {
            restart,
          },
        }),
      }),
    }),
    cancelProcessing: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/books/${uuid}/process`,
        method: "DELETE",
      }),
    }),
    mergeBooks: build.mutation<
      BookWithRelations,
      { update: BookUpdate; relations: BookRelationsUpdate; from: UUID[] }
    >({
      query: (body) => ({
        url: `/books/merge`,
        method: "POST",
        body,
      }),
    }),
    createBook: build.mutation<
      BookWithRelations,
      { collection: UUID | undefined; paths: string[] }
    >({
      query: (body) => ({
        url: `/books`,
        method: "POST",
        body,
      }),
    }),
    updateBook: build.mutation<
      BookWithRelations,
      {
        update: {
          uuid: BookUpdate["uuid"]
          title?: BookUpdate["title"]
          subtitle?: BookUpdate["subtitle"]
          language?: BookUpdate["language"]
          status?: UUID | undefined
          publicationDate?: BookUpdate["publicationDate"]
          authors?: string[]
          creators?: CreatorRelation[]
          series?: SeriesRelation[]
          collections?: UUID[]
          tags?: string[]
          narrators?: string[]
          rating?: number | null
          description?: string | null
        }
        textCover?: File | null
        audioCover?: File | null
      }
    >({
      query: ({ update, textCover, audioCover }) => {
        const updatedFields = Object.entries({
          ...update,
          textCover,
          audioCover,
        }).reduce<string[]>(
          (acc, [field, value]) =>
            value !== undefined ? [...acc, field] : acc,
          [],
        )
        const body = new FormData()

        for (const field of updatedFields) {
          body.append("fields", field)
        }

        if (updatedFields.includes("title")) {
          body.append("title", JSON.stringify(update.title))
        }
        if (updatedFields.includes("subtitle")) {
          body.append("subtitle", JSON.stringify(update.subtitle))
        }
        if (updatedFields.includes("language")) {
          body.append("language", JSON.stringify(update.language))
        }
        if (updatedFields.includes("publicationDate")) {
          body.append("publicationDate", JSON.stringify(update.publicationDate))
        }
        if (updatedFields.includes("status")) {
          body.append("status", JSON.stringify(update.status))
        }
        if (updatedFields.includes("description")) {
          body.append("description", JSON.stringify(update.description))
        }
        if (updatedFields.includes("rating")) {
          body.append("rating", JSON.stringify(update.rating))
        }

        if (update.tags) {
          for (const tag of update.tags) {
            body.append("tags", JSON.stringify(tag))
          }
        }

        if (update.narrators) {
          for (const narrator of update.narrators) {
            body.append("narrators", JSON.stringify(narrator))
          }
        }

        if (update.authors) {
          for (const author of update.authors) {
            body.append("authors", JSON.stringify(author))
          }
        }

        if (update.creators) {
          for (const creator of update.creators) {
            body.append("creators", JSON.stringify(creator))
          }
        }

        if (update.series) {
          for (const series of update.series) {
            body.append("series", JSON.stringify(series))
          }
        }

        if (update.collections) {
          for (const collection of update.collections) {
            body.append("collections", collection)
          }
        }

        if (textCover != null) {
          body.append("textCover", textCover)
        }

        if (audioCover != null) {
          body.append("audioCover", audioCover)
        }

        return {
          url: `/books/${update.uuid}`,
          method: "PUT",
          body,
        }
      },
      invalidatesTags: ["Creators", "Authors", "Series", "Tags"],
    }),
    updateStatus: build.mutation<void, { bookUuid: UUID; statusUuid: UUID }>({
      query: ({ bookUuid, statusUuid }) => ({
        url: `/books/${bookUuid}/status`,
        method: "PUT",
        body: {
          status: statusUuid,
        },
      }),
    }),
    listStatuses: build.query<Status[], void>({
      query: () => `/statuses`,
      providesTags: (statuses) =>
        statuses?.map((status) => ({ type: "Statuses", id: status.uuid })) ?? [
          "Statuses",
        ],
    }),
    listCreators: build.query<Creator[], void>({
      query: () => "/creators",
      providesTags: (creators) =>
        creators?.map((creator) => ({
          type: "Creators",
          id: creator.uuid,
        })) ?? ["Creators"],
    }),
    listAuthors: build.query<Creator[], void>({
      query: () => "/creators?role=aut",
      providesTags: (creators) =>
        creators?.map((creator) => ({
          type: "Authors",
          id: creator.uuid,
        })) ?? ["Authors"],
    }),
    listSeries: build.query<Series[], void>({
      query: () => "/series",
      providesTags: (series) =>
        series?.map((s) => ({ type: "Series", id: s.uuid })) ?? ["Series"],
    }),
    updateSeries: build.mutation<
      SeriesWithBooks,
      {
        uuid: UUID
        update: {
          name: string
          description: string
          relations: NewSeriesRelation[]
        }
      }
    >({
      query: ({ uuid, update }) => ({
        url: `/series/${uuid}`,
        method: "PUT",
        body: update,
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        { type: "Series", id: uuid },
      ],
    }),
    deleteSeries: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/series/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Series"],
    }),
    listCollections: build.query<CollectionWithRelations[], void>({
      query: () => "/collections",
      providesTags: (collections) =>
        collections?.map((collection) => ({
          type: "Collections",
          id: collection.uuid,
        })) ?? [{ type: "Collections" }],
    }),
    deleteCollection: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/collections/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Collections"],
    }),
    updateCollection: build.mutation<
      CollectionWithRelations,
      {
        uuid: UUID
        update: {
          name?: string
          description?: string | null
          public?: boolean
          users?: UUID[]
          books?: UUID[]
          importPath?: string | null
        }
      }
    >({
      query: ({ uuid, update }) => ({
        url: `/collections/${uuid}`,
        method: "PUT",
        body: update,
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        { type: "Collections", id: uuid },
      ],
    }),
    addBooksToCollections: build.mutation<
      void,
      { collections: UUID[]; books: UUID[] }
    >({
      query: (body) => ({
        url: `/collections/books`,
        method: "POST",
        body,
      }),
    }),
    removeBooksFromCollections: build.mutation<
      void,
      { collections: UUID[]; books: UUID[] }
    >({
      query: (body) => ({
        url: `/collections/books`,
        method: "DELETE",
        body,
      }),
    }),
    createCollection: build.mutation<
      CollectionWithRelations,
      {
        name: string
        description: string
        public: boolean
        users: string[]
        importPath: string | null
      }
    >({
      query: ({ name, description, public: isPublic, users, importPath }) => ({
        url: "/collections",
        method: "POST",
        body: {
          name,
          description,
          public: isPublic,
          ...(!isPublic && { users }),
          importPath,
        },
      }),
      invalidatesTags: ["Collections"],
    }),
    addBooksToSeries: build.mutation<
      void,
      { series: NewSeries; relations: NewSeriesRelation[] }
    >({
      query: (body) => ({
        url: `/series/books`,
        method: "POST",
        body,
      }),
    }),
    removeBooksFromSeries: build.mutation<
      void,
      { series: UUID[]; books: UUID[] }
    >({
      query: (body) => ({
        url: "/series/books",
        method: "DELETE",
        body,
      }),
    }),
    listTags: build.query<Tag[], void>({
      query: () => "/tags",
      providesTags: (tags) =>
        tags?.map((tag) => ({ type: "Tags", id: tag.uuid })) ?? ["Tags"],
    }),
    addTagsToBooks: build.mutation<void, { tags: string[]; books: UUID[] }>({
      query: (body) => ({
        url: `/books/tags`,
        method: "POST",
        body,
      }),
    }),
    removeTagsFromBooks: build.mutation<void, { tags: UUID[]; books: UUID[] }>({
      query: (body) => ({
        url: "/books/tags",
        method: "DELETE",
        body,
      }),
    }),
    updateReadingStatus: build.mutation<void, { status: UUID; books: UUID[] }>({
      query: (body) => ({
        url: "/books/status",
        method: "PUT",
        body,
      }),
    }),
  }),
})

export const {
  useAddBooksToCollectionsMutation,
  useAddBooksToSeriesMutation,
  useAddTagsToBooksMutation,
  useCancelProcessingMutation,
  useCreateBookMutation,
  useCreateCollectionMutation,
  useCreateInviteMutation,
  useDeleteBookAssetsMutation,
  useDeleteBookMutation,
  useDeleteBooksMutation,
  useGetPositionQuery,
  useGetBookQuery,
  useUpdatePositionMutation,
  useDeleteCollectionMutation,
  useDeleteInviteMutation,
  useDeleteSeriesMutation,
  useDeleteUserMutation,
  useGetCurrentUserQuery,
  useGetMaxUploadChunkSizeQuery,
  useGetShelvesQuery,
  useLazyListCollectionsQuery,
  useLazyListCreatorsQuery,
  useLazyListSeriesQuery,
  useLazyListTagsQuery,
  useListAuthorsQuery,
  useListCreatorsQuery,
  useListBooksQuery,
  useListCollectionsQuery,
  useListInvitesQuery,
  useListSeriesQuery,
  useListStatusesQuery,
  useListTagsQuery,
  useListUsersQuery,
  useMergeBooksMutation,
  useProcessBookMutation,
  useRemoveBooksFromCollectionsMutation,
  useRemoveBooksFromSeriesMutation,
  useRemoveTagsFromBooksMutation,
  useResendInviteMutation,
  useUpdateBookMutation,
  useUpdateCollectionMutation,
  useUpdateReadingStatusMutation,
  useUpdateSeriesMutation,
  useUpdateSettingsMutation,
  useUpdateStatusMutation,
  useUpdateUserMutation,
} = api

export function getDownloadUrl(
  bookUuid: string,
  format: "readaloud" | "audiobook" | "ebook",
) {
  const searchParams = new URLSearchParams({ format })
  return `/api/v2/books/${bookUuid}/files?${searchParams.toString()}`
}

export function getCoverUrl(
  bookUuid: string,
  {
    height,
    width,
    updatedAt,
    audio = false,
  }: {
    height?: number
    width?: number
    audio?: boolean
    updatedAt: string | Date
  },
) {
  const searchParams = new URLSearchParams()
  if (audio) {
    searchParams.append("audio", "true")
  }
  if (height) {
    searchParams.append("h", height.toString())
  }
  if (width) {
    searchParams.append("w", width.toString())
  }
  return `/api/v2/books/${bookUuid}/cover?${searchParams.toString()}&v=${new Date(updatedAt).getTime()}`
}
