/* eslint-disable @typescript-eslint/no-invalid-void-type */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import { BookDetail, Invite, InviteRequest, Settings, User } from "@/apiModels"
import { UUID } from "@/uuid"
import { UserPermissionSet } from "@/database/users"
import { BookEvent } from "@/events"
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import { ProcessingTask } from "@/database/processingTasks"
import { AuthorRelation, BookUpdate, SeriesRelation } from "@/database/books"
import { Status } from "@/database/statuses"
import { Author } from "@/database/authors"
import { NewSeries, NewSeriesRelation, Series } from "@/database/series"
import { CollectionWithRelations } from "@/database/collections"
import { Tag } from "@/database/tags"

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v2" }),
  tagTypes: [
    "Invites",
    "Users",
    "Statuses",
    "Authors",
    "Series",
    "Collections",
    "Tags",
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
    }),
    updateSettings: build.mutation({
      query: (settings: Settings) => ({
        url: "/settings",
        method: "PUT",
        body: settings,
      }),
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
    listBooks: build.query<BookDetail[], void>({
      query: () => "/books",
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
                case "bookCacheDeleted": {
                  draftBook.originalFilesExist = false
                  return
                }
                case "processingQueued": {
                  draftBook.processingStatus = "queued"
                  draftBook.processingTask = {
                    type: ProcessingTaskType.SPLIT_CHAPTERS,
                    progress: 0,
                    status: ProcessingTaskStatus.STARTED,
                  } as ProcessingTask
                  return
                }
                case "processingCompleted": {
                  draftBook.processingStatus = null
                  draftBook.processingTask = {
                    type: ProcessingTaskType.SYNC_CHAPTERS,
                    progress: 1,
                    status: ProcessingTaskStatus.COMPLETED,
                  } as ProcessingTask
                  return
                }
                case "processingStopped": {
                  draftBook.processingStatus = null
                  draftBook.processingTask = {
                    type:
                      draftBook.processingTask?.type ??
                      ProcessingTaskType.SPLIT_CHAPTERS,
                    progress: draftBook.processingTask?.progress ?? 0,
                    status:
                      draftBook.processingTask?.status ??
                      ProcessingTaskStatus.STARTED,
                  } as ProcessingTask
                  return
                }
                case "processingFailed": {
                  draftBook.processingStatus = null
                  draftBook.processingTask = {
                    ...draftBook.processingTask,
                    status: ProcessingTaskStatus.IN_ERROR,
                  } as ProcessingTask
                  return
                }
                case "processingStarted": {
                  draftBook.processingStatus = "processing"
                  draftBook.processingTask = {
                    type: ProcessingTaskType.SPLIT_CHAPTERS,
                    progress: 0,
                    status: ProcessingTaskStatus.STARTED,
                  } as ProcessingTask
                  return
                }
                case "taskProgressUpdated": {
                  draftBook.processingStatus = "processing"
                  draftBook.processingTask = {
                    ...draftBook.processingTask,
                    progress: event.payload.progress,
                    status: ProcessingTaskStatus.STARTED,
                  } as ProcessingTask
                  return
                }
                case "taskTypeUpdated": {
                  draftBook.processingStatus = "processing"
                  draftBook.processingTask = {
                    ...draftBook.processingTask,
                    type: event.payload.taskType,
                    status: ProcessingTaskStatus.STARTED,
                  } as ProcessingTask
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
    processBook: build.mutation<void, { uuid: UUID; restart?: boolean }>({
      query: ({ uuid, restart }) => ({
        url: `/books/${uuid}/process`,
        method: "POST",
        params: {
          restart,
        },
      }),
    }),
    cancelProcessing: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/books/${uuid}/process`,
        method: "DELETE",
      }),
    }),
    updateBook: build.mutation<
      BookDetail,
      {
        update: {
          uuid: BookUpdate["uuid"]
          title?: BookUpdate["title"]
          language?: BookUpdate["language"]
          statusUuid?: BookUpdate["statusUuid"]
          publicationDate?: BookUpdate["publicationDate"]
          authors?: AuthorRelation[]
          series?: SeriesRelation[]
          collections?: UUID[]
          tags?: string[]
        }
        textCover?: File | null
        audioCover?: File | null
      }
    >({
      query: ({ update, textCover, audioCover }) => {
        const body = new FormData()
        if (update.title != null) {
          body.append("title", update.title)
        }
        if (update.language != null) {
          body.append("language", update.language)
        }
        if (update.publicationDate) {
          body.append("publicationDate", update.publicationDate)
        }
        if (update.statusUuid != null) {
          body.append("statusUuid", update.statusUuid)
        }

        if (update.tags) {
          for (const tag of update.tags) {
            body.append("tags", tag)
          }
        }

        if (update.authors) {
          for (const author of update.authors) {
            body.append("authors", JSON.stringify(author))
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
    }),
    listStatuses: build.query<Status[], void>({
      query: () => `/statuses`,
      providesTags: (statuses) =>
        statuses?.map((status) => ({ type: "Statuses", id: status.uuid })) ?? [
          "Statuses",
        ],
    }),
    listAuthors: build.query<Author[], void>({
      query: () => "/authors",
      providesTags: (authors) =>
        authors?.map((author) => ({ type: "Authors", id: author.uuid })) ?? [
          "Authors",
        ],
    }),
    listSeries: build.query<Series[], void>({
      query: () => "/series",
      providesTags: (series) =>
        series?.map((s) => ({ type: "Series", id: s.uuid })) ?? ["Series"],
    }),
    listCollections: build.query<CollectionWithRelations[], void>({
      query: () => "/collections",
      providesTags: (collections) =>
        collections?.map((collection) => ({
          type: "Collections",
          id: collection.uuid,
        })) ?? ["Collections"],
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
  }),
})

export const {
  useAddBooksToCollectionsMutation,
  useAddBooksToSeriesMutation,
  useCancelProcessingMutation,
  useCreateCollectionMutation,
  useCreateInviteMutation,
  useDeleteBookAssetsMutation,
  useDeleteBookMutation,
  useDeleteInviteMutation,
  useDeleteUserMutation,
  useGetCurrentUserQuery,
  useListAuthorsQuery,
  useListBooksQuery,
  useListCollectionsQuery,
  useListInvitesQuery,
  useListSeriesQuery,
  useListStatusesQuery,
  useListTagsQuery,
  useListUsersQuery,
  useProcessBookMutation,
  useRemoveBooksFromCollectionsMutation,
  useRemoveBooksFromSeriesMutation,
  useResendInviteMutation,
  useUpdateBookMutation,
  useUpdateCollectionMutation,
  useUpdateSettingsMutation,
  useUpdateUserMutation,
} = api

export function getDownloadUrl(
  bookUuid: string,
  format: "readaloud" | "audiobook" | "ebook",
) {
  const searchParams = new URLSearchParams({ format })
  return `/api/v2/books/${bookUuid}/files?${searchParams.toString()}`
}

export function getCoverUrl(bookUuid: string, audio = false) {
  const searchParams = new URLSearchParams()
  if (audio) {
    searchParams.append("audio", "true")
  }
  return `/api/v2/books/${bookUuid}/cover?${searchParams.toString()}`
}
