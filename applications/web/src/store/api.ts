import { type GuidedNavigationDocument } from "@readium/shared"
/* eslint-disable @typescript-eslint/no-invalid-void-type */
import {
  type BaseQueryFn,
  type MutationDefinition,
  createApi,
  fetchBaseQuery,
} from "@reduxjs/toolkit/query/react"
import { v4 as uuidv4 } from "uuid"

import { type EmissionCapabilities } from "@storyteller-platform/ghost-story/emission-client"
import {
  type BookMetadataCandidate,
  type BookMetadataProvider,
  type BookMetadataSearchResult,
  type CoverCandidate,
  type CoverSearchQuery,
  type MetadataSearchQuery,
} from "@storyteller-platform/nodekit/types"
import { type JsColor } from "@storyteller-platform/okmain"

import {
  type AlignmentDecisions,
  type AlignmentOverrides,
  type BookAlignmentReportView,
} from "@/alignmentReportView"
import { dismissalKey } from "@/announcement-builtins"
import {
  type Invite,
  type InviteRequest,
  type ServerCapabilities,
  type Settings,
  type User,
} from "@/apiModels"
import { type UpgradeResult } from "@/app/api/v2/books/[bookId]/upgrade-epub/route"
import { type BackupInfo } from "@/backups"
import { type ChapterAudio } from "@/chapterAudio"
import { type Role } from "@/components/books/edit/marcRelators"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  type CreatorRelation,
  type IdentifierRelation,
  type SeriesRelation,
  type UserBookRatingRelation,
} from "@/database/books"
import { type ChangelogEntry } from "@/database/changelog"
import { type CollectionWithRelations } from "@/database/collections"
import { type AddCreatorInput, type Creator } from "@/database/creators"
import { type HomeStats } from "@/database/homeStats"
import {
  type Identifier,
  type IdentifierType,
  type IdentifierTypeUpdate,
  type NewIdentifierType,
} from "@/database/identifiers"
import { type Image } from "@/database/images"
import { type ImportRuleWithCollections } from "@/database/importRules"
import { type DisplayJob } from "@/database/jobs"
import {
  type FacetSection,
  type FacetValue,
  type LibraryCounts,
} from "@/database/libraryCounts"
import { type RewritePreview, type RewriteResult } from "@/database/pathRewrite"
import { type Position } from "@/database/positions"
import { type MetadataProvidersResponse } from "@/database/providerTokens"
import {
  type RatingDimensionScores,
  computeRatingAverage,
} from "@/database/ratingDimensions"
import {
  type NewSeries,
  type NewSeriesRelation,
  type Series,
} from "@/database/series"
import {
  type Epub2ImportStrategy,
  type ImportMode,
  type MetadataFieldOverrides,
} from "@/database/settingsTypes"
import {
  type HomeSectionKind,
  type HomeSectionWithDetails,
  type ShelfOrderBy,
  type ShelfWithBooks,
} from "@/database/shelves"
import {
  type SidebarGroupInput,
  type SidebarGroupWithItems,
} from "@/database/sidebar"
import { type Status } from "@/database/statuses"
import { type AddTagInput, type Tag } from "@/database/tags"
import {
  type PreferenceDefaults,
  type PreferenceDefaultsUpdate,
  type UserPreferences,
  type UserPreferencesForm,
} from "@/database/userPreferencesTypes"
import { type UserBookRating } from "@/database/userRatings"
import { type UserPermissionSet } from "@/database/users"
import { type SeriesWithBooks } from "@/hooks/useFilterSortedSeries"
import {
  type JobListFilter,
  type JobListPatch,
  applyJobEvent,
  applyJobPatch,
  compareJobs,
  queueJobNext,
} from "@/jobList"
import { type OrphanFolder, type StorageUsage } from "@/maintenance"
import { type AutoImportResult } from "@/metadataAutoImport"
import { type CoverImportRequest } from "@/metadataImport"
import { type MetadataImportBody } from "@/metadataImportTypes"
import { type JobsQueryV2 } from "@/schemas/v2/job"
import { type TranscodedAudioFile } from "@/schemas/v2/transcodedAudio"
import { type ShelfFilter } from "@/shelves"
import { type SortField } from "@/sort"
import { type UUID } from "@/uuid"
import { type StageName } from "@/work/jobStats"
import { type RunConfig } from "@/work/runConfig"

import { subscribeToEventStream } from "./eventStream"

type SingleUserSettingUpdate = {
  [K in keyof UserPreferences]: { name: K; value: UserPreferences[K] }
}[keyof UserPreferences]

type HomeSectionBody = {
  shelfUuid?: string | null
  kind: HomeSectionKind
  enabled?: boolean
  config?: unknown
}

type SidebarGroupBody = SidebarGroupInput

const MEMBERSHIP_EVENT_DEBOUNCE_MS = 300

let membershipBridgeStarted = false

function startBookMembershipBridge(dispatch: (action: unknown) => unknown) {
  if (membershipBridgeStarted) return
  membershipBridgeStarted = true

  let timer: ReturnType<typeof setTimeout> | null = null

  subscribeToEventStream("book", (event) => {
    if (event.type !== "bookCreated" && event.type !== "bookDeleted") return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      dispatch(api.util.invalidateTags(["Books", "HomeSections", "HomeStats"]))
    }, MEMBERSHIP_EVENT_DEBOUNCE_MS)
  })
}

type JobListsLifecycle = Pick<
  Parameters<
    NonNullable<
      MutationDefinition<
        unknown,
        BaseQueryFn,
        string,
        unknown,
        "api"
      >["onQueryStarted"]
    >
  >[1],
  "dispatch" | "getState"
>

function patchJobLists(
  { dispatch, getState }: JobListsLifecycle,
  recipe: (draft: DisplayJob[], filter: JobListFilter | undefined) => void,
) {
  const args = api.util.selectCachedArgsForQuery(getState(), "getJobs")
  return args.map((arg) =>
    dispatch(
      api.util.updateQueryData("getJobs", arg, (draft) => {
        recipe(draft, arg as JobListFilter | undefined)
      }),
    ),
  )
}

async function undoOnFailure(
  patches: { undo: () => void }[],
  queryFulfilled: Promise<unknown>,
) {
  try {
    await queryFulfilled
  } catch {
    for (const patch of patches) patch.undo()
  }
}

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
    "Narrators",
    "Translators",
    "MaxUploadChunkSize",
    "UserReadingPreferences",
    "UserReadingState",
    "GpuBuildWarning",
    "Books",
    "ImportRules",
    "UserRatings",
    "HomeSections",
    "HomeStats",
    "UserShelves",
    "UserSettings",
    "Sidebar",
    "Jobs",
    "BookAlignmentReport",
    "TranscodedAudio",
    "Settings",
    "Identifiers",
    "BookIdentifiers",
    "Backups",
    "PathsStatus",
    "ServerCapabilities",
    "CacheUsage",
    "MaintenanceStorage",
    "Orphans",
    "MetadataProviders",
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
    sendPasswordReset: build.mutation<void, { userId: UUID }>({
      query: ({ userId }) => ({
        url: `/users/${userId}/reset-password`,
        method: "POST",
      }),
    }),
    getCurrentUser: build.query<User, void>({
      query: () => "/user",
      providesTags: () => ["CurrentUser"],
    }),
    getServerCapabilities: build.query<ServerCapabilities, void>({
      query: () => "/server/capabilities",
      providesTags: () => ["ServerCapabilities"],
    }),
    testCtcServer: build.mutation<
      EmissionCapabilities,
      { url: string; apiKey: string | null }
    >({
      query: (body) => ({
        url: "/server/ctc-server",
        method: "POST",
        body,
      }),
    }),
    getMaxUploadChunkSize: build.query<
      { maxUploadChunkSize: number | null; overriden: boolean },
      void
    >({
      query: () => "/settings/maxUploadChunkSize",
      providesTags: () => ["MaxUploadChunkSize"],
    }),
    uploadImage: build.mutation<Image, File>({
      query: (file) => ({
        url: "/images",
        method: "POST",
        body: file,
        headers: {
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        },
      }),
    }),
    getSettings: build.query<Settings, void>({
      query: () => "/settings",
      providesTags: ["Settings"],
    }),
    updateSettings: build.mutation<Settings, Partial<Settings>>({
      query: (settings) => ({
        url: "/settings",
        method: "PUT",
        body: settings,
      }),
      invalidatesTags: [
        "MaxUploadChunkSize",
        "Settings",
        "ImportRules",
        "MetadataProviders",
      ],
    }),
    updatePreferenceDefaults: build.mutation<
      PreferenceDefaults,
      PreferenceDefaultsUpdate
    >({
      query: (body) => ({
        url: "/settings/preference-defaults",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Settings"],
    }),
    getGpuBuildWarning: build.query<
      | {
          showWarning: true
          variant: string | undefined
          whisperBuild: string | null
        }
      | { showWarning: false; variant?: never; whisperBuild?: never },
      void
    >({
      query: () => ({
        url: "/books/_/process",
        method: "POST",
        params: { gpuWarning: "check" },
      }),
      providesTags: ["GpuBuildWarning"],
    }),
    getBook: build.query<BookWithRelations, { uuid: UUID }>({
      query: ({ uuid }) => `/books/${uuid}`,

      providesTags: (result) =>
        result
          ? ([
              { type: "Books" as const, id: result.uuid },
              ...result.authors.map((author) => ({
                type: "Authors" as const,
                id: author.uuid,
              })),
              ...result.creators.map((creator) => ({
                type: "Creators" as const,
                id: creator.uuid,
              })),
              ...result.series.map((series) => ({
                type: "Series" as const,
                id: series.uuid,
              })),
              ...result.collections.map((collection) => ({
                type: "Collections" as const,
                id: collection.uuid,
              })),
              ...result.tags.map((tag) => ({
                type: "Tags" as const,
                id: tag.uuid,
              })),
              ...(result.status
                ? [{ type: "Statuses" as const, id: result.status.uuid }]
                : []),
            ] as const)
          : [],
      onCacheEntryAdded: async (
        { uuid },
        /* eslint-disable-next-line @typescript-eslint/unbound-method */
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) => {
        try {
          await cacheDataLoaded
        } catch {
          /* empty */
        }

        const unsubscribe = subscribeToEventStream("book", (event) => {
          if (event.bookUuid !== uuid) return
          if (event.type !== "bookUpdated") return

          updateCachedData((draft) => {
            Object.assign(draft, event.payload)
          })
        })

        await cacheEntryRemoved
        unsubscribe()
      },
    }),
    deleteBook: build.mutation<
      void,
      {
        uuid: UUID
        preventReImport?: boolean
      }
    >({
      query: ({ uuid, preventReImport }) => ({
        url: `/books/${uuid}`,
        method: "DELETE",
        params: {
          preventReImport,
        },
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        "Books",
        { type: "Books", id: uuid },
        "ImportRules",
      ],
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
    getBooksCacheUsage: build.query<
      {
        bytes: number
        bookCount: number
        parts: {
          transcodedAudio: number
          transcriptions: number
          emissions: number
        }
      },
      { bookUuids?: UUID[] }
    >({
      query: ({ bookUuids }) => ({
        url: `/books/cache/usage`,
        method: "POST",
        body: { bookUuids },
      }),
      providesTags: ["CacheUsage"],
    }),
    clearBooksCache: build.mutation<void, { bookUuids?: UUID[] }>({
      query: ({ bookUuids }) => ({
        url: `/books/cache`,
        method: "DELETE",
        body: { bookUuids },
      }),
      invalidatesTags: ["CacheUsage"],
    }),
    recomputeAlignmentReports: build.mutation<
      { count: number },
      { bookUuids?: UUID[] }
    >({
      query: ({ bookUuids }) => ({
        url: `/books/alignment-reports/recompute`,
        method: "POST",
        body: { bookUuids },
      }),
      invalidatesTags: (_result, _error, { bookUuids }) => [
        "Books",
        ...(bookUuids
          ? bookUuids.map((uuid) => ({
              type: "BookAlignmentReport" as const,
              id: uuid,
            }))
          : ["BookAlignmentReport" as const]),
      ],
    }),
    deleteBooks: build.mutation<
      void,
      {
        books: UUID[]
        preventReImport?: boolean
      }
    >({
      query: ({ books, preventReImport }) => ({
        url: `/books`,
        method: "DELETE",
        body: {
          books,
          preventReImport,
        },
      }),
      invalidatesTags: (_result, _error, { books }) => [
        "Books",
        ...books.map((uuid) => ({ type: "Books" as const, id: uuid })),
        "ImportRules",
      ],
    }),
    replaceBookAsset: build.mutation<
      BookWithRelations,
      {
        uuid: UUID
        format: "ebook" | "audiobook" | "readaloud"
        path: string
        importMode?: ImportMode
        metadataFieldOverrides?: MetadataFieldOverrides
      }
    >({
      query: ({ uuid, ...body }) => ({
        url: `/books/${uuid}/replace-asset`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        "Books",
        { type: "Books", id: uuid },
      ],
    }),
    removeBookAsset: build.mutation<
      BookWithRelations,
      {
        uuid: UUID
        format: "ebook" | "audiobook" | "readaloud"
      }
    >({
      query: ({ uuid, format }) => ({
        url: `/books/${uuid}/replace-asset`,
        method: "DELETE",
        params: { format },
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        "Books",
        { type: "Books", id: uuid },
      ],
    }),
    updateBookAssetDir: build.mutation<
      BookWithRelations,
      {
        uuid: UUID
        assetDir: string
        conflictResolution?: {
          ebook?: "current" | "target"
          audiobook?: "current" | "target"
          readaloud?: "current" | "target"
        }
      }
    >({
      query: ({ uuid, ...body }) => ({
        url: `/books/${uuid}/asset-dir`,
        method: "PUT",
        body,
      }),
    }),
    relocateToInternal: build.mutation<
      BookWithRelations,
      { uuid: UUID; mode?: "copy" | "move" | "hardlink" }
    >({
      query: ({ uuid, mode }) => ({
        url: `/books/${uuid}/relocate-to-internal`,
        method: "POST",
        body: { mode },
      }),
    }),
    bulkRelocateToInternal: build.mutation<
      BookWithRelations[],
      { bookUuids: UUID[]; mode?: "copy" | "move" | "hardlink" }
    >({
      query: (body) => ({
        url: `/books/relocate-to-internal`,
        method: "POST",
        body,
      }),
    }),
    getImportRules: build.query<ImportRuleWithCollections[], void>({
      query: () => `/import-rules`,
      providesTags: ["ImportRules"],
    }),
    getUserImportRules: build.query<ImportRuleWithCollections[], void>({
      query: () => `/import-rules?source=user`,
      providesTags: ["ImportRules"],
    }),
    createImportRule: build.mutation<
      ImportRuleWithCollections,
      {
        kind: "watch" | "ignore"
        path: string
        importMode?: string | null
        epub2ImportStrategy?: string | null
        collectionUuids?: UUID[]
      }
    >({
      query: (body) => ({
        url: `/import-rules`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["ImportRules"],
    }),
    updateImportRule: build.mutation<
      ImportRuleWithCollections,
      {
        uuid: UUID
        path?: string
        importMode?: string | null
        epub2ImportStrategy?: string | null
        collectionUuids?: UUID[]
      }
    >({
      query: ({ uuid, ...body }) => ({
        url: `/import-rules/${uuid}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["ImportRules"],
    }),
    deleteImportRule: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/import-rules/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: ["ImportRules"],
    }),
    deleteImportRules: build.mutation<void, { uuids: UUID[] }>({
      query: ({ uuids }) => ({
        url: `/import-rules`,
        method: "DELETE",
        body: { uuids },
      }),
      invalidatesTags: ["ImportRules"],
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

        const unsubscribe = subscribeToEventStream("book", (event) => {
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

        unsubscribe()
      },
    }),
    listNextUpBooks: build.query<BookWithRelations[], void>({
      query: () => "/books/next-up",
      providesTags: ["Books"],
    }),
    listInfiniteBooks: build.infiniteQuery<
      BookWithRelations[],
      ListBooksQueryArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 0,

        getNextPageParam: (
          lastPage,
          _allPages,
          lastPageParam,
          _allPageParams,
          queryArg,
        ) => {
          const limit = queryArg.limit ?? 50
          if (lastPage.length < limit) return undefined
          return lastPageParam + 1
        },
        getPreviousPageParam: (
          _firstPage,
          _allPages,
          firstPageParam,
          _allPageParams,
          _queryArg,
        ) => {
          return firstPageParam > 0 ? firstPageParam - 1 : undefined
        },
      },
      query: ({ pageParam, queryArg }) => {
        const limit = queryArg.limit ?? 50
        const params = new URLSearchParams()
        params.set("limit", String(limit))
        params.set("offset", String(pageParam * limit))
        if (queryArg.orderBy) params.set("orderBy", queryArg.orderBy)
        if (queryArg.orderDirection)
          params.set("orderDirection", queryArg.orderDirection)
        if (queryArg.search) params.set("search", queryArg.search)
        if (queryArg.collection) params.set("collection", queryArg.collection)
        if (queryArg.series) params.set("series", queryArg.series)
        if (queryArg.filter)
          params.set("filter", JSON.stringify(queryArg.filter))
        return `/books?${params.toString()}`
      },
      providesTags: ["Books"],
      onCacheEntryAdded: async (
        _arg,
        /* eslint-disable-next-line @typescript-eslint/unbound-method */
        { dispatch, cacheDataLoaded },
      ) => {
        try {
          await cacheDataLoaded
        } catch {
          /* empty */
        }

        startBookMembershipBridge(dispatch)
      },
    }),
    processBook: build.mutation<
      void,
      {
        uuid: UUID
        restart?: "full" | "transcode" | "transcription" | "sync" | false
        dismissGpuWarning?: boolean
        config?: Partial<RunConfig>
      }
    >({
      query: ({ uuid, restart, dismissGpuWarning, config }) => {
        const params: Record<string, string> = {}
        if (restart) params["restart"] = restart
        if (dismissGpuWarning) params["gpuWarning"] = "dismiss"
        return {
          url: `/books/${uuid}/process`,
          method: "POST",
          ...(Object.keys(params).length > 0 && { params }),
          ...(config && { body: { config } }),
        }
      },
      invalidatesTags: (_result, _error, { dismissGpuWarning }) =>
        dismissGpuWarning ? ["GpuBuildWarning", "Jobs"] : ["Jobs"],
    }),
    cancelProcessing: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/books/${uuid}/process`,
        method: "DELETE",
      }),
    }),
    triggerBookScan: build.mutation<
      void,
      {
        uuid: UUID
        force?: boolean
        metadataFieldOverrides?: Record<string, string>
      }
    >({
      query: ({ uuid, force, metadataFieldOverrides }) => ({
        url: `/books/${uuid}/scan`,
        method: "POST",
        ...(force && { params: { force: "true" } }),
        ...(metadataFieldOverrides && {
          body: { metadataFieldOverrides },
        }),
      }),
    }),
    triggerScan: build.mutation<
      void,
      {
        force?: boolean
        metadataFieldOverrides?: Record<string, string>
      } | void
    >({
      query: (args) => ({
        url: "/books/scan",
        method: "POST",
        ...(args?.force && { params: { force: "true" } }),
        ...(args?.metadataFieldOverrides && {
          body: { metadataFieldOverrides: args.metadataFieldOverrides },
        }),
      }),
    }),
    scanBooks: build.mutation<void, { bookUuids: string[]; force?: boolean }>({
      query: (args) => ({
        url: "/books/scan",
        method: "POST",
        ...(args.force && { params: { force: "true" } }),
        body: { bookUuids: args.bookUuids },
      }),
    }),
    cancelScan: build.mutation<void, void>({
      query: () => ({
        url: "/books/scan",
        method: "DELETE",
      }),
    }),
    getScanState: build.query<
      { running: boolean; source: string | null; startedAt: number | null },
      void
    >({
      query: () => "/books/scan",
    }),
    upgradeBookEpub: build.mutation<
      Record<string, UpgradeResult>,
      { uuid: UUID; createBackup?: boolean; backupSuffix?: string }
    >({
      query: ({ uuid, createBackup, backupSuffix }) => ({
        url: `/books/${uuid}/upgrade-epub`,
        method: "POST",
        body: { createBackup, backupSuffix },
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
      invalidatesTags: (_result, _error, { update, from }) => [
        "Books",
        "Series",
        "Creators",
        "Authors",
        "Tags",
        "Collections",
        ...(update.uuid ? [{ type: "Books" as const, id: update.uuid }] : []),
        ...from.map((uuid) => ({ type: "Books" as const, id: uuid })),
      ],
    }),
    createBook: build.mutation<
      BookWithRelations | { epub2Detected: true; paths: string[] },
      {
        collection: UUID | undefined
        paths: string[]
        importMode?: ImportMode
        epub2Strategy?: Epub2ImportStrategy | "auto"
      }
    >({
      query: (body) => ({
        url: `/books`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Books"],
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
          releaseDate?: BookUpdate["releaseDate"]
          authors?: string[]
          creators?: CreatorRelation[]
          pageCount?: number | null
          duration?: number | null
          series?: SeriesRelation[]
          collections?: UUID[]
          tags?: string[]
          narrators?: string[]
          userBookRating?: UserBookRatingRelation
          description?: string | null
          coverColorsOverride?: JsColor[] | null
          identifiers?: IdentifierRelation[]
        }
        textCover?: File | null
        audioCover?: File | null
      }
    >({
      query: ({ update, textCover, audioCover }) => {
        const { uuid, ...rest } = update
        const updatedFields = Object.entries({
          ...rest,
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
        if (updatedFields.includes("releaseDate")) {
          body.append("releaseDate", JSON.stringify(update.releaseDate))
        }
        if (updatedFields.includes("status")) {
          body.append("status", JSON.stringify(update.status))
        }
        if (updatedFields.includes("description")) {
          body.append("description", JSON.stringify(update.description))
        }
        if (updatedFields.includes("pageCount")) {
          body.append("pageCount", JSON.stringify(update.pageCount))
        }
        if (updatedFields.includes("duration")) {
          body.append("duration", JSON.stringify(update.duration))
        }
        if (updatedFields.includes("coverColorsOverride")) {
          body.append(
            "coverColorsOverride",
            JSON.stringify(update.coverColorsOverride),
          )
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

        if (update.identifiers) {
          for (const identifier of update.identifiers) {
            body.append("identifiers", JSON.stringify(identifier))
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
      invalidatesTags: (book) => [
        "Creators",
        "Authors",
        "Series",
        "Tags",
        "Books",
        ...(book ? [{ type: "Books" as const, id: book.uuid }] : []),
        ...(book
          ? book.authors.map((author) => ({
              type: "Authors" as const,
              id: author.uuid,
            }))
          : []),
        ...(book
          ? book.creators.map((creator) => ({
              type: "Creators" as const,
              id: creator.uuid,
            }))
          : []),
        ...(book
          ? book.series.map((series) => ({
              type: "Series" as const,
              id: series.uuid,
            }))
          : []),
        ...(book
          ? book.collections.map((collection) => ({
              type: "Collections" as const,
              id: collection.uuid,
            }))
          : []),
        ...(book
          ? book.tags.map((tag) => ({ type: "Tags" as const, id: tag.uuid }))
          : []),
        ...(book
          ? book.status
            ? [{ type: "Statuses" as const, id: book.status.uuid }]
            : []
          : []),
        "UserRatings",
        ...(book ? [{ type: "BookIdentifiers" as const, id: book.uuid }] : []),
      ],

      onQueryStarted: async (
        { update },
        /* eslint-disable-next-line @typescript-eslint/unbound-method */
        { dispatch, getState, queryFulfilled },
      ) => {
        const patchResult = dispatch(
          api.util.updateQueryData(
            "getBook",
            { uuid: update.uuid as UUID },
            (draft) => {
              if (update.title !== undefined) draft.title = update.title
              if (update.subtitle !== undefined)
                draft.subtitle = update.subtitle
              if (update.language !== undefined)
                draft.language = update.language
              if (update.description !== undefined)
                draft.description = update.description
              if (update.publicationDate !== undefined)
                draft.publicationDate = update.publicationDate
              if (update.releaseDate !== undefined)
                draft.releaseDate = update.releaseDate

              if (update.status !== undefined) {
                const statuses = api.endpoints.listStatuses.select()(getState())
                const status = statuses.data?.find(
                  (s) => s.uuid === update.status,
                )

                if (status) {
                  draft.status = {
                    uuid: status.uuid,
                    name: status.name,
                    label: status.label,
                    createdAt: status.createdAt,
                    updatedAt: status.updatedAt,
                  }
                }
              }

              if (update.userBookRating !== undefined) {
                Object.assign(draft, {
                  userBookRating: {
                    rating: update.userBookRating.rating ?? null,
                    review: update.userBookRating.review ?? null,
                  },
                })
              }

              if (update.pageCount !== undefined && draft.ebook) {
                draft.ebook.pageCount = update.pageCount
              }

              if (update.duration !== undefined && draft.audiobook) {
                draft.audiobook.duration = update.duration
              }
            },
          ),
        )

        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),
    updateStatus: build.mutation<
      void,
      { bookUuid: UUID; statusUuid: UUID | null }
    >({
      query: ({ bookUuid, statusUuid }) => ({
        url: `/books/${bookUuid}/status`,
        method: "PUT",
        body: {
          status: statusUuid,
        },
      }),
      invalidatesTags: (_result, _error, { bookUuid, statusUuid }) => [
        "Books",
        "Statuses",
        { type: "Books", id: bookUuid },
        ...(statusUuid ? [{ type: "Statuses" as const, id: statusUuid }] : []),
      ],

      onQueryStarted: async (
        { bookUuid, statusUuid },
        /* eslint-disable-next-line @typescript-eslint/unbound-method */
        { dispatch, getState, queryFulfilled },
      ) => {
        const statuses = api.endpoints.listStatuses.select()(getState())
        const status = statuses.data?.find((s) => s.uuid === statusUuid)

        if (statusUuid !== null && !status) {
          await queryFulfilled
          return
        }

        const patchResult = dispatch(
          api.util.updateQueryData("getBook", { uuid: bookUuid }, (draft) => {
            draft.status = status
              ? {
                  uuid: status.uuid,
                  name: status.name,
                  label: status.label,
                  createdAt: status.createdAt,
                  updatedAt: status.updatedAt,
                }
              : null
          }),
        )

        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),
    getLibraryCounts: build.query<LibraryCounts, void>({
      query: () => `/library/counts`,
      providesTags: [
        "Books",
        "Series",
        "Authors",
        "Narrators",
        "Translators",
        "Tags",
        "Statuses",
        "Collections",
        "UserRatings",
        "UserShelves",
        "Sidebar",
      ],
    }),
    getBooksCount: build.query<number, ListBooksQueryArg>({
      query: (queryArg) => {
        const params = new URLSearchParams()
        if (queryArg.orderBy) params.set("orderBy", queryArg.orderBy)
        if (queryArg.orderDirection)
          params.set("orderDirection", queryArg.orderDirection)
        if (queryArg.search) params.set("search", queryArg.search)
        if (queryArg.collection) params.set("collection", queryArg.collection)
        if (queryArg.series) params.set("series", queryArg.series)
        if (queryArg.filter)
          params.set("filter", JSON.stringify(queryArg.filter))
        return `/books/count?${params.toString()}`
      },
      transformResponse: (response: { count: number }) => response.count,
      providesTags: ["Books"],
    }),
    getSectionFacets: build.query<FacetValue[], { section: FacetSection }>({
      query: ({ section }) => `/library/facets?section=${section}`,
      providesTags: [
        "Books",
        "Series",
        "Authors",
        "Narrators",
        "Translators",
        "Tags",
        "Statuses",
        "Collections",
        "UserRatings",
        "UserShelves",
        "Sidebar",
        "Identifiers",
      ],
    }),
    listStatuses: build.query<Status[], void>({
      query: () => `/statuses`,
      providesTags: (statuses) =>
        statuses?.map((status) => ({ type: "Statuses", id: status.uuid })) ?? [
          "Statuses",
        ],
    }),
    updateStatusLabel: build.mutation<void, { uuid: UUID; label: string }>({
      query: ({ uuid, label }) => ({
        url: `/statuses/${uuid}`,
        method: "PUT",
        body: { label },
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        "Books",
        { type: "Statuses", id: uuid },
      ],
    }),
    createStatus: build.mutation<Status, { name: string; label?: string }>({
      query: (body) => ({
        url: "/statuses",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Statuses"],
    }),
    deleteStatus: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/statuses/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Statuses", "Books"],
    }),
    setLibraryDefaultStatus: build.mutation<
      void,
      { uuid: UUID; isDefault: boolean }
    >({
      query: ({ uuid, isDefault }) => ({
        url: `/statuses/${uuid}`,
        method: "PUT",
        body: { isDefault },
      }),
      invalidatesTags: ["Statuses"],
    }),
    listDistinctFieldValues: build.query<string[], { field: string }>({
      query: ({ field }) =>
        `/books/distinct?field=${encodeURIComponent(field)}`,
      providesTags: ["Books"],
    }),
    listCreators: build.query<(Creator & { roles: Role[] })[], void>({
      query: () => "/creators",
      providesTags: (creators) =>
        creators?.map((creator) => ({
          type: "Creators",
          id: creator.uuid,
        })) ?? ["Creators"],
    }),
    getCreator: build.query<Creator & { roles: Role[] }, UUID>({
      query: (uuid) => `/creators/${uuid}`,
      providesTags: (_result, _error, uuid) => [{ type: "Creators", id: uuid }],
    }),
    listAuthors: build.query<Creator[], void>({
      query: () => "/creators?role=aut",
      providesTags: (creators) =>
        creators?.map((creator) => ({
          type: "Authors",
          id: creator.uuid,
        })) ?? ["Authors"],
    }),

    listNarrators: build.query<Creator[], void>({
      query: () => "/creators?role=nrt",
      providesTags: (creators) =>
        creators?.map((creator) => ({
          type: "Narrators",
          id: creator.uuid,
        })) ?? ["Narrators"],
    }),

    listTranslators: build.query<Creator[], void>({
      query: () => "/creators?role=trl",
      providesTags: (creators) =>
        creators?.map((creator) => ({
          type: "Translators",
          id: creator.uuid,
        })) ?? ["Translators"],
    }),
    listSeries: build.query<Series[], void>({
      query: () => "/series",
      providesTags: (series) =>
        series?.map((s) => ({ type: "Series", id: s.uuid })) ?? ["Series"],
    }),
    updateSeries: build.mutation<
      SeriesWithBooks | null,
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
        "Series",
        { type: "Series", id: uuid },
      ],
    }),
    deleteSeries: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/series/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        "Series",
        { type: "Series", id: uuid },
      ],
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
      invalidatesTags: ["Collections", "Sidebar"],
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
          icon?: string | null
          color?: string | null
        }
      }
    >({
      query: ({ uuid, update }) => ({
        url: `/collections/${uuid}`,
        method: "PUT",
        body: update,
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        "Collections",
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
      invalidatesTags: (_result, _error, { books, collections }) => [
        "Books",
        ...books.map((uuid) => ({ type: "Books" as const, id: uuid })),
        ...collections.map((uuid) => ({
          type: "Collections" as const,
          id: uuid,
        })),
      ],
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
      invalidatesTags: (_result, _error, { books, collections }) => [
        "Books",
        ...books.map((uuid) => ({ type: "Books" as const, id: uuid })),
        ...collections.map((uuid) => ({
          type: "Collections" as const,
          id: uuid,
        })),
      ],
    }),
    createCollection: build.mutation<
      CollectionWithRelations,
      {
        name: string
        description: string
        public: boolean
        users: string[]
      }
    >({
      query: ({ name, description, public: isPublic, users }) => ({
        url: "/collections",
        method: "POST",
        body: {
          name,
          description,
          public: isPublic,
          ...(!isPublic && { users }),
        },
      }),
      invalidatesTags: ["Collections", "Sidebar"],
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
      invalidatesTags: (_result, _error, { relations }) => [
        "Series",
        "Books",
        ...relations.map((r) => ({ type: "Books" as const, id: r.bookUuid })),
      ],

      onQueryStarted: async (
        { series, relations },
        /* eslint-disable-next-line @typescript-eslint/unbound-method */
        { dispatch, getState, queryFulfilled },
      ) => {
        const seriesUuid = series.uuid

        const existingSeries = seriesUuid
          ? api.endpoints.listSeries
              .select()(getState())
              .data?.find((s) => s.uuid === seriesUuid)
          : undefined

        const now = new Date().toISOString()
        const seriesEntry = {
          uuid: (seriesUuid ?? uuidv4()) as UUID,
          name: series.name,
          createdAt: existingSeries?.createdAt ?? now,
          updatedAt: existingSeries?.updatedAt ?? now,
        }

        const patches = relations.map((relation) =>
          dispatch(
            api.util.updateQueryData(
              "getBook",
              { uuid: relation.bookUuid },
              (draft) => {
                if (
                  seriesUuid &&
                  draft.series.some((s) => s.uuid === seriesUuid)
                ) {
                  return
                }

                draft.series.push({
                  ...seriesEntry,
                  position: relation.position ?? null,
                  featured: relation.featured ?? false,
                })
              },
            ),
          ),
        )

        try {
          await queryFulfilled
        } catch {
          patches.forEach((p) => {
            p.undo()
          })
        }
      },
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
      invalidatesTags: (_result, _error, { books, series }) => [
        "Books",
        ...books.map((uuid) => ({ type: "Books" as const, id: uuid })),
        ...series.map((uuid) => ({ type: "Series" as const, id: uuid })),
      ],

      onQueryStarted: async (
        { series, books },
        { dispatch, queryFulfilled },
      ) => {
        const seriesSet = new Set(series)

        const patches = books.map((bookUuid) =>
          dispatch(
            api.util.updateQueryData("getBook", { uuid: bookUuid }, (draft) => {
              draft.series = draft.series.filter((s) => !seriesSet.has(s.uuid))
            }),
          ),
        )

        try {
          await queryFulfilled
        } catch {
          patches.forEach((p) => {
            p.undo()
          })
        }
      },
    }),
    listTags: build.query<Tag[], void>({
      query: () => "/tags",
      providesTags: (tags) =>
        tags?.map((tag) => ({ type: "Tags", id: tag.uuid })) ?? ["Tags"],
    }),
    createTag: build.mutation<
      Tag,
      { name: string; icon?: string | null; color?: string | null }
    >({
      query: (body) => ({
        url: "/tags",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Tags"],
    }),
    addTagsToBooks: build.mutation<
      void,
      { tags: AddTagInput[]; books: UUID[] }
    >({
      query: (body) => ({
        url: `/books/tags`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { books }) => [
        "Tags",
        "Books",
        ...books.map((uuid) => ({ type: "Books" as const, id: uuid })),
      ],
    }),
    removeTagsFromBooks: build.mutation<void, { tags: UUID[]; books: UUID[] }>({
      query: (body) => ({
        url: "/books/tags",
        method: "DELETE",
        body,
      }),
      invalidatesTags: (_result, _error, { books, tags }) => [
        "Tags",
        "Books",
        ...books.map((uuid) => ({ type: "Books" as const, id: uuid })),
        ...tags.map((uuid) => ({ type: "Tags" as const, id: uuid })),
      ],
    }),
    addCreatorsToBooks: build.mutation<
      void,
      { creators: (string | AddCreatorInput)[]; books: UUID[]; role: Role }
    >({
      query: (body) => ({
        url: `/books/creators`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { books }) => [
        "Creators",
        "Authors",
        "Narrators",
        "Translators",
        "Books",
        ...books.map((uuid) => ({ type: "Books" as const, id: uuid })),
      ],
    }),
    removeCreatorsFromBooks: build.mutation<
      void,
      { creators: UUID[]; books: UUID[]; role: Role }
    >({
      query: (body) => ({
        url: "/books/creators",
        method: "DELETE",
        body,
      }),
      invalidatesTags: (_result, _error, { books }) => [
        "Creators",
        "Authors",
        "Narrators",
        "Translators",
        "Books",
        ...books.map((uuid) => ({ type: "Books" as const, id: uuid })),
      ],
    }),

    updateTag: build.mutation<
      Tag,
      {
        uuid: UUID
        update: {
          name?: string
          icon?: string | null
          color?: string | null
        }
      }
    >({
      query: ({ uuid, update }) => ({
        url: `/tags/${uuid}`,
        method: "PUT",
        body: update,
      }),
      invalidatesTags: ["Tags", "Books"],
    }),

    deleteTag: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/tags/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Tags", "Books", "UserShelves"],
    }),

    mergeTags: build.mutation<void, { targetUuid: UUID; sourceUuids: UUID[] }>({
      query: (body) => ({
        url: "/tags/merge",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Tags", "Books", "UserShelves"],
    }),

    updateCreator: build.mutation<
      Creator,
      { uuid: UUID; update: { name?: string; fileAs?: string } }
    >({
      query: ({ uuid, update }) => ({
        url: `/creators/${uuid}`,
        method: "PUT",
        body: update,
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        "Authors",
        "Narrators",
        "Translators",
        "Books",
        { type: "Creators", id: uuid },
      ],
    }),

    deleteCreator: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/creators/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: [
        "Authors",
        "Narrators",
        "Translators",
        "Books",
        "UserShelves",
      ],
    }),

    mergeCreators: build.mutation<
      void,
      { targetUuid: UUID; sourceUuids: UUID[] }
    >({
      query: (body) => ({
        url: "/creators/merge",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        "Authors",
        "Narrators",
        "Translators",
        "Books",
        "UserShelves",
      ],
    }),

    mergeSeries: build.mutation<
      void,
      { targetUuid: UUID; sourceUuids: UUID[] }
    >({
      query: (body) => ({
        url: "/series/merge",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Series", "Books", "UserShelves"],
    }),

    mergeCollections: build.mutation<
      void,
      { targetUuid: UUID; sourceUuids: UUID[] }
    >({
      query: (body) => ({
        url: "/collections/merge",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Collections", "Books", "UserShelves"],
    }),
    updateReadingStatus: build.mutation<
      BookWithRelations,
      { status: UUID | null; books: UUID[] }
    >({
      query: (body) => ({
        url: "/books/status",
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { books }) => [
        "Statuses",
        "Books",
        ...books.map((uuid) => ({ type: "Books" as const, id: uuid })),
      ],
    }),
    getUserBookRating: build.query<UserBookRating | null, { bookUuid: UUID }>({
      query: ({ bookUuid }) => `/books/${bookUuid}/rating`,
      providesTags: (_result, _error, { bookUuid }) => [
        { type: "UserRatings", id: `${bookUuid}-${_result?.userId}` },
      ],
    }),
    setUserBookRating: build.mutation<
      UserBookRating | null,
      {
        bookUuid: UUID
        rating?: number | null
        review?: string | null
        dimensions?: RatingDimensionScores | null
      }
    >({
      query: ({ bookUuid, ...body }) => ({
        url: `/books/${bookUuid}/rating`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { bookUuid }) => [
        { type: "UserRatings", id: `${bookUuid}-${_result?.userId}` },
        "UserRatings",
        "Books",
      ],

      onQueryStarted: async (
        { bookUuid, rating, review, dimensions },
        { dispatch, queryFulfilled },
      ) => {
        const patchResult = dispatch(
          api.util.updateQueryData("getBook", { uuid: bookUuid }, (draft) => {
            const existing = draft.userBookRating
            const nextReview =
              review !== undefined ? review : (existing?.review ?? null)

            let nextRating: number | null
            let nextDimensions: RatingDimensionScores | null

            if (dimensions !== undefined) {
              const scores =
                dimensions && Object.values(dimensions).length
                  ? dimensions
                  : null
              nextDimensions = scores

              if (rating !== undefined) {
                nextRating = rating
              } else if (scores) {
                nextRating = computeRatingAverage(scores)
              } else {
                nextRating = existing?.rating ?? null
              }
            } else {
              nextRating =
                rating !== undefined ? rating : (existing?.rating ?? null)
              nextDimensions = existing?.dimensions ?? null
            }

            Object.assign(draft, {
              userBookRating:
                nextRating == null && nextReview == null
                  ? null
                  : {
                      rating: nextRating,
                      review: nextReview,
                      dimensions: nextDimensions,
                    },
            })
          }),
        )

        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),
    deleteUserBookRating: build.mutation<void, { bookUuid: UUID }>({
      query: ({ bookUuid }) => ({
        url: `/books/${bookUuid}/rating`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { bookUuid }) => [
        { type: "UserRatings", id: bookUuid },
        "UserRatings",
        "Books",
      ],

      onQueryStarted: async ({ bookUuid }, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          api.util.updateQueryData("getBook", { uuid: bookUuid }, (draft) => {
            draft.userBookRating = null
          }),
        )

        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),
    listUserBookRatings: build.query<UserBookRating[], void>({
      query: () => "/user/ratings",
      providesTags: (ratings) =>
        ratings?.map((r) => ({
          type: "UserRatings",
          id: `${r.bookUuid}-${r.userId}`,
        })) ?? ["UserRatings"],
    }),

    getUserSettings: build.query<UserPreferences, void>({
      query: () => "/user/settings",
      providesTags: () => ["UserSettings"],
    }),
    updateUserSettings: build.mutation<
      Record<string, unknown>,
      Partial<UserPreferencesForm>
    >({
      query: (body) => ({
        url: "/user/settings",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["UserSettings"],
    }),
    setUserSetting: build.mutation<
      Record<string, unknown>,
      SingleUserSettingUpdate
    >({
      query: ({ name, value }) => ({
        url: `/user/settings`,
        method: "PUT",
        body: { [name]: value },
      }),
      invalidatesTags: ["UserSettings"],
    }),
    dismissAnnouncement: build.mutation<void, { key: string }>({
      query: ({ key }) => ({
        url: `/user/settings`,
        method: "PUT",
        body: { [dismissalKey(key)]: true },
      }),
      invalidatesTags: ["UserSettings"],
    }),

    setUserSettingRaw: build.mutation<void, { name: string; value: unknown }>({
      query: ({ name, value }) => ({
        url: `/user/settings`,
        method: "PUT",
        body: { [name]: value },
      }),
      invalidatesTags: ["UserSettings"],
    }),

    listIdentifierTypes: build.query<IdentifierType[], void>({
      query: () => "/identifiers",
      providesTags: (identifiers) =>
        identifiers?.map((i) => ({ type: "Identifiers", id: i.uuid })) ?? [
          "Identifiers",
        ],
    }),
    createIdentifierType: build.mutation<IdentifierType, NewIdentifierType>({
      query: (body) => ({
        url: "/identifiers",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Identifiers"],
    }),
    updateIdentifierType: build.mutation<
      void,
      { uuid: UUID; update: IdentifierTypeUpdate }
    >({
      query: ({ uuid, update }) => ({
        url: `/identifiers/${uuid}`,
        method: "PUT",
        body: update,
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        { type: "Identifiers", id: uuid },
        "Identifiers",
        "Books",
      ],
    }),
    deleteIdentifierType: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/identifiers/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Identifiers", "Books"],
    }),
    mergeIdentifierTypes: build.mutation<
      void,
      { targetUuid: UUID; sourceUuids: UUID[] }
    >({
      query: (body) => ({
        url: "/identifiers/merge",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Identifiers", "Books"],
    }),
    listBookIdentifiers: build.query<Identifier[], { bookUuid: UUID }>({
      query: ({ bookUuid }) => `/books/${bookUuid}/identifiers`,
      providesTags: (result, _error, { bookUuid }) => [
        { type: "BookIdentifiers", id: bookUuid },
        ...(result?.map((bi) => ({
          type: "BookIdentifiers" as const,
          id: bi.uuid,
        })) ?? []),
      ],
    }),
    updateBookIdentifiers: build.mutation<
      void,
      { bookUuid: UUID; identifiers: IdentifierRelation[] }
    >({
      query: ({ bookUuid, identifiers }) => ({
        url: `/books/${bookUuid}/identifiers`,
        method: "PUT",
        body: { identifiers },
      }),
      invalidatesTags: (_result, _error, { bookUuid }) => [
        { type: "BookIdentifiers", id: bookUuid },
        { type: "Books", id: bookUuid },
        "Books",
        "Identifiers",
      ],
    }),

    getBookOpf: build.query<
      string,
      { bookUuid: UUID; format: "ebook" | "readaloud" }
    >({
      query: ({ bookUuid, format }) => ({
        url: `/books/${bookUuid}/debug/opf?format=${format}`,
        responseHandler: "text",
      }),
    }),
    getBookMediaOverlay: build.query<string, { bookUuid: UUID; href: string }>({
      query: ({ bookUuid, href }) => ({
        url: `/books/${bookUuid}/debug/media-overlay?href=${encodeURIComponent(href)}`,
        responseHandler: "text",
      }),
    }),

    getInfiniteChangelog: build.infiniteQuery<
      ChangelogEntry[],
      string,
      { page: number; perPage: number }
    >({
      infiniteQueryOptions: {
        getNextPageParam: (_lastPage, _allPages, lastPageParam) => {
          return {
            page: lastPageParam.page + 1,
            perPage: lastPageParam.perPage,
          }
        },
        initialPageParam: { page: 1, perPage: 20 },
        getPreviousPageParam: (_firstPage, _allPages, firstPageParam) => {
          return firstPageParam.page > 1
            ? {
                page: firstPageParam.page - 1,
                perPage: firstPageParam.perPage,
              }
            : undefined
        },
      },
      query: ({ pageParam, queryArg }) => {
        const params = new URLSearchParams({
          component: queryArg,
          page: String(pageParam.page),
          perPage: String(pageParam.perPage),
        })
        return `/changelog?${params.toString()}`
      },
    }),

    getChangelog: build.query<
      ChangelogEntry[],
      { component?: string; page?: number; perPage?: number }
    >({
      query: ({ component = "web", page = 1, perPage = 20 }) => {
        const params = new URLSearchParams({
          component,
          page: String(page),
          perPage: String(perPage),
        })
        return `/changelog?${params.toString()}`
      },
    }),

    getLatestChangelog: build.query<
      {
        version: string
        description: string | null
        releasedAt: string
      } | null,
      { component?: string }
    >({
      query: ({ component = "web" }) =>
        `/changelog/latest?component=${component}`,
    }),

    // shelves
    getHomeStats: build.query<HomeStats, void>({
      query: () => "/home/stats",
      providesTags: ["HomeStats", "CurrentUser"],
    }),

    listHomeSections: build.query<HomeSectionWithDetails[], void>({
      query: () => "/home/sections",
      providesTags: ["HomeSections", "CurrentUser"],
    }),

    setHomeSections: build.mutation<
      HomeSectionWithDetails[],
      HomeSectionBody[]
    >({
      query: (body) => ({
        url: "/home/sections",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["HomeSections"],
    }),

    updateHomeSection: build.mutation<
      HomeSectionWithDetails,
      { uuid: string; enabled: boolean }
    >({
      query: ({ uuid, enabled }) => ({
        url: `/home/sections/${uuid}`,
        method: "PATCH",
        body: { enabled },
      }),
      invalidatesTags: ["HomeSections"],
    }),

    listSidebarGroups: build.query<SidebarGroupWithItems[], void>({
      query: () => "/sidebar",
      providesTags: ["Sidebar", "CurrentUser"],
    }),

    setSidebarGroups: build.mutation<
      SidebarGroupWithItems[],
      SidebarGroupBody[]
    >({
      query: (body) => ({
        url: "/sidebar",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Sidebar"],
    }),

    listUserShelves: build.query<ShelfWithBooks[], void>({
      query: () => "/shelves",
      providesTags: ["UserShelves", "CurrentUser"],
    }),

    createUserShelf: build.mutation<
      ShelfWithBooks,
      {
        name: string
        description?: string | null
        filter?: ShelfFilter | null
        orderBy?: ShelfOrderBy
        orderDirection?: "asc" | "desc"
        limitCount?: number | null
        books?: string[]
        icon?: string | null
        color?: string | null
      }
    >({
      query: (body) => ({
        url: "/shelves",
        method: "POST",
        body,
      }),
      invalidatesTags: ["UserShelves", "Sidebar"],
    }),

    updateUserShelf: build.mutation<
      ShelfWithBooks,
      {
        uuid: string
        name?: string
        description?: string | null
        filter?: ShelfFilter | null
        orderBy?: ShelfOrderBy
        orderDirection?: "asc" | "desc"
        limitCount?: number | null
        books?: string[]
        icon?: string | null
        color?: string | null
      }
    >({
      query: ({ uuid, ...body }) => ({
        url: `/shelves/${uuid}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["UserShelves", "Sidebar"],
    }),

    deleteUserShelf: build.mutation<void, { uuid: string }>({
      query: ({ uuid }) => ({
        url: `/shelves/${uuid}`,
        method: "DELETE",
      }),
      invalidatesTags: ["UserShelves", "HomeSections", "Sidebar"],
    }),

    listShelfBooks: build.query<
      BookWithRelations[],
      {
        shelfUuid: string
        limit?: number
        offset?: number
        orderBy?: ShelfOrderBy
        orderDirection?: "asc" | "desc"
        sortField?: SortField
        search?: string
        filter?: ShelfFilter
      }
    >({
      query: ({ shelfUuid, ...params }) => {
        const searchParams = new URLSearchParams()

        if (params.limit) searchParams.set("limit", String(params.limit))
        if (params.offset) searchParams.set("offset", String(params.offset))
        if (params.orderBy) searchParams.set("orderBy", params.orderBy)
        if (params.orderDirection)
          searchParams.set("orderDirection", params.orderDirection)
        if (params.sortField) searchParams.set("sortField", params.sortField)
        if (params.search) searchParams.set("search", params.search)
        if (params.filter)
          searchParams.set("filter", JSON.stringify(params.filter))

        return `/shelves/${shelfUuid}/books?${searchParams.toString()}`
      },
      providesTags: ["Books"],
    }),

    listInfiniteShelfBooks: build.infiniteQuery<
      BookWithRelations[],
      ListShelfBooksQueryArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 0,

        getNextPageParam: (
          lastPage,
          _allPages,
          lastPageParam,
          _allPageParams,
          queryArg,
        ) => {
          const limit = queryArg.limit ?? 50
          if (lastPage.length < limit) return undefined
          return lastPageParam + 1
        },
        getPreviousPageParam: (_firstPage, _allPages, firstPageParam) => {
          return firstPageParam > 0 ? firstPageParam - 1 : undefined
        },
      },
      query: ({ pageParam, queryArg }) => {
        const { shelfUuid, ...params } = queryArg
        const limit = params.limit ?? 50
        const searchParams = new URLSearchParams()

        searchParams.set("limit", String(limit))
        searchParams.set("offset", String(pageParam * limit))
        if (params.sortField) searchParams.set("sortField", params.sortField)
        if (params.orderBy) searchParams.set("orderBy", params.orderBy)
        if (params.orderDirection)
          searchParams.set("orderDirection", params.orderDirection)
        if (params.search) searchParams.set("search", params.search)
        if (params.filter)
          searchParams.set("filter", JSON.stringify(params.filter))

        return `/shelves/${shelfUuid}/books?${searchParams.toString()}`
      },
      providesTags: ["Books"],
    }),

    previewShelfFilter: build.mutation<
      BookWithRelations[],
      {
        filter: ShelfFilter
        orderBy?: string
        orderDirection?: "asc" | "desc"
        limit?: number
      }
    >({
      query: (body) => ({
        url: "/shelves/preview",
        method: "POST",
        body,
      }),
    }),

    // logs
    getLogs: build.query<
      {
        lines: unknown[]
        date: string
        today: string
        availableDates: string[]
        totalBytes: number
      },
      { lines?: number; search?: string; level?: string; date?: string }
    >({
      query: ({ lines, search, level, date }) => {
        const params = new URLSearchParams()
        if (lines) params.set("lines", String(lines))
        if (search) params.set("search", search)
        if (level) params.set("level", level)
        if (date) params.set("date", date)
        return `/logs?${params.toString()}`
      },
    }),

    getLogLevel: build.query<{ level: string }, void>({
      query: () => "/logs/level",
    }),

    setLogLevel: build.mutation<{ level: string }, { level: string }>({
      query: (body) => ({
        url: "/logs/level",
        method: "PUT",
        body,
      }),
    }),

    clearLogs: build.mutation<{ ok: boolean }, void>({
      query: () => ({
        url: "/logs/clear",
        method: "POST",
      }),
    }),

    getMaintenanceStorage: build.query<
      Record<"imageCache" | "uploads" | "logs", StorageUsage>,
      void
    >({
      query: () => "/maintenance/storage",
      providesTags: ["MaintenanceStorage"],
    }),
    clearImageCache: build.mutation<void, void>({
      query: () => ({ url: "/maintenance/image-cache", method: "DELETE" }),
      invalidatesTags: ["MaintenanceStorage"],
    }),
    clearStaleUploads: build.mutation<void, void>({
      query: () => ({ url: "/maintenance/uploads", method: "DELETE" }),
      invalidatesTags: ["MaintenanceStorage"],
    }),
    deleteAllLogs: build.mutation<void, void>({
      query: () => ({ url: "/maintenance/logs", method: "DELETE" }),
      invalidatesTags: ["MaintenanceStorage"],
    }),
    getOrphans: build.query<
      { folders: OrphanFolder[]; images: StorageUsage },
      void
    >({
      query: () => "/maintenance/orphans",
      providesTags: ["Orphans"],
    }),
    deleteOrphanFolders: build.mutation<
      { deleted: number },
      { names: string[] }
    >({
      query: ({ names }) => ({
        url: "/maintenance/orphans/folders",
        method: "DELETE",
        body: { names },
      }),
      invalidatesTags: ["Orphans"],
    }),
    deleteUnusedImages: build.mutation<{ deleted: number }, void>({
      query: () => ({ url: "/maintenance/orphans/images", method: "DELETE" }),
      invalidatesTags: ["Orphans"],
    }),

    // database backups
    getBackups: build.query<{ backups: BackupInfo[] }, void>({
      query: () => "/backups",
      providesTags: ["Backups"],
    }),

    createBackup: build.mutation<{ name: string }, void>({
      query: () => ({
        url: "/backups",
        method: "POST",
      }),
      invalidatesTags: ["Backups"],
    }),

    deleteBackup: build.mutation<{ ok: boolean }, { name: string }>({
      query: ({ name }) => ({
        url: `/backups/${encodeURIComponent(name)}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Backups"],
    }),

    // stored file paths
    getPathsStatus: build.query<
      { anchor: string | null; currentDataDir: string },
      void
    >({
      query: () => "/paths",
      providesTags: ["PathsStatus"],
    }),

    previewPathRewrite: build.mutation<
      { preview: RewritePreview },
      { from: string; to: string }
    >({
      query: (body) => ({
        url: "/paths/rewrite",
        method: "POST",
        body: { ...body, dryRun: true },
      }),
    }),

    applyPathRewrite: build.mutation<
      { result: RewriteResult },
      { from: string; to: string }
    >({
      query: (body) => ({
        url: "/paths/rewrite",
        method: "POST",
        body: { ...body, dryRun: false },
      }),
      invalidatesTags: ["PathsStatus", "Books"],
    }),

    acknowledgePaths: build.mutation<{ ok: boolean }, void>({
      query: () => ({
        url: "/paths/acknowledge",
        method: "POST",
      }),
      invalidatesTags: ["PathsStatus"],
    }),

    // processing jobs queue
    getJobs: build.query<DisplayJob[], JobsQueryV2 | void>({
      query: (arg) => {
        const filter: JobsQueryV2 = (arg as JobsQueryV2 | undefined) ?? {}
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(filter) as [
          string,
          string | number | string[] | undefined,
        ][]) {
          if (value === undefined) {
            continue
          }
          params.set(
            key,
            Array.isArray(value) ? value.join(",") : String(value),
          )
        }
        return `/jobs?${params.toString()}`
      },
      providesTags: ["Jobs"],
      onCacheEntryAdded: async (
        arg,
        /* eslint-disable-next-line @typescript-eslint/unbound-method */
        { cacheDataLoaded, cacheEntryRemoved, updateCachedData, dispatch },
      ) => {
        try {
          await cacheDataLoaded
        } catch {
          /* empty */
        }

        const filter = arg as JobListFilter | undefined

        const unsubscribe = subscribeToEventStream("job", (event) => {
          const outcome: { value: JobListPatch } = { value: "patched" }
          updateCachedData((draft) => {
            outcome.value = applyJobEvent(draft, filter, event)
          })
          if (outcome.value === "refetch") {
            void dispatch(
              api.endpoints.getJobs.initiate(arg, {
                subscribe: false,
                forceRefetch: true,
              }),
            )
          }
        })

        await cacheEntryRemoved
        unsubscribe()
      },
    }),
    getAlignmentEstimate: build.query<
      {
        estimateSeconds: number | null
        stageSeconds: Partial<Record<StageName, number>>
        sampleSize: number
      },
      {
        bookUuid: UUID
        engine: string
        whisperModel: string | null
        restart: string | false
      }
    >({
      query: ({ bookUuid, engine, whisperModel, restart }) => {
        const params = new URLSearchParams()
        params.set("bookUuid", bookUuid)
        params.set("engine", engine)
        if (whisperModel) params.set("whisperModel", whisperModel)
        if (restart) params.set("restart", restart)
        return `/jobs/estimate?${params.toString()}`
      },
      providesTags: ["Jobs"],
    }),

    cancelJob: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({ url: `/jobs/${uuid}`, method: "DELETE" }),
      onQueryStarted: async ({ uuid }, lifecycle) => {
        const patches = patchJobLists(lifecycle, (draft, filter) => {
          applyJobPatch(draft, filter, uuid, {
            status: "CANCELED",
            finishedAt: new Date().toISOString(),
          })
        })
        await undoOnFailure(patches, lifecycle.queryFulfilled)
      },
    }),
    reorderJobs: build.mutation<void, { order: UUID[] }>({
      query: ({ order }) => ({
        url: "/jobs",
        method: "PATCH",
        body: { order },
      }),
      onQueryStarted: async ({ order }, lifecycle) => {
        const patches = patchJobLists(lifecycle, (draft, filter) => {
          for (const [index, uuid] of order.entries()) {
            const job = draft.find((candidate) => candidate.uuid === uuid)
            if (job) job.position = index
          }
          draft.sort(compareJobs(filter))
        })
        await undoOnFailure(patches, lifecycle.queryFulfilled)
      },
    }),
    pauseJob: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/jobs/${uuid}`,
        method: "PATCH",
        body: { action: "pause" },
      }),
      onQueryStarted: async ({ uuid }, lifecycle) => {
        const patches = patchJobLists(lifecycle, (draft, filter) => {
          applyJobPatch(draft, filter, uuid, { status: "PAUSED" })
        })
        await undoOnFailure(patches, lifecycle.queryFulfilled)
      },
    }),
    resumeJob: build.mutation<void, { uuid: UUID }>({
      query: ({ uuid }) => ({
        url: `/jobs/${uuid}`,
        method: "PATCH",
        body: { action: "resume" },
      }),
      onQueryStarted: async ({ uuid }, lifecycle) => {
        const patches = patchJobLists(lifecycle, (draft, filter) => {
          queueJobNext(draft, uuid)
          applyJobPatch(draft, filter, uuid, {
            status: "QUEUED",
            finishedAt: null,
          })
        })
        await undoOnFailure(patches, lifecycle.queryFulfilled)
      },
    }),
    getBookAlignmentReport: build.query<
      BookAlignmentReportView,
      { uuid: UUID; reportUuid?: UUID }
    >({
      query: ({ uuid, reportUuid }) =>
        `/books/${uuid}/alignment-report${reportUuid ? `?reportUuid=${reportUuid}` : ""}`,
      providesTags: (_result, _error, { uuid }) => [
        { type: "BookAlignmentReport", id: uuid },
      ],
    }),
    getBookChapterText: build.query<
      string,
      { uuid: UUID; updatedAt: string; href: string }
    >({
      query: ({ uuid, updatedAt, href }) => ({
        url: `/books/${uuid}/read/${href
          .split("/")
          .map(encodeURIComponent)
          .join("/")}?v=${new Date(updatedAt).getTime()}`,
        responseHandler: "text",
      }),
    }),
    getBookChapterGuidedNavigation: build.query<
      GuidedNavigationDocument,
      { uuid: UUID; updatedAt: string; href: string }
    >({
      query: ({ uuid, updatedAt, href }) => ({
        url: `/books/${uuid}/read/~readium/guided-navigation.json?ref=${href
          .split("/")
          .map(encodeURIComponent)
          .join("/")}&v=${new Date(updatedAt).getTime()}`,
      }),
    }),
    getBookChapterAudio: build.query<
      ChapterAudio,
      { bookUuid: UUID; version: string; href: string }
    >({
      query: ({ bookUuid, version, href }) =>
        `/books/${bookUuid}/debug/chapter-audio?href=${encodeURIComponent(href)}&v=${encodeURIComponent(version)}`,
    }),
    getTranscodedAudio: build.query<TranscodedAudioFile[], { uuid: UUID }>({
      query: ({ uuid }) => `/books/${uuid}/transcoded-audio`,
      providesTags: (_result, _error, { uuid }) => [
        { type: "TranscodedAudio", id: uuid },
      ],
    }),
    getBookAlignmentDecisions: build.query<AlignmentDecisions, { uuid: UUID }>({
      query: ({ uuid }) => `/books/${uuid}/alignment-decisions`,
      providesTags: (_result, _error, { uuid }) => [
        { type: "BookAlignmentReport", id: uuid },
      ],
    }),
    updateBookAlignmentDecisions: build.mutation<
      AlignmentDecisions,
      { uuid: UUID; decisions: AlignmentDecisions }
    >({
      query: ({ uuid, decisions }) => ({
        url: `/books/${uuid}/alignment-decisions`,
        method: "PUT",
        body: decisions,
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        { type: "BookAlignmentReport", id: uuid },
        "Books",
      ],
    }),
    updateBookAlignmentOverrides: build.mutation<
      { ok: boolean },
      { uuid: UUID; overrides: AlignmentOverrides }
    >({
      query: ({ uuid, overrides }) => ({
        url: `/books/${uuid}/alignment-report`,
        method: "PATCH",
        body: overrides,
      }),
      invalidatesTags: (_result, _error, { uuid }) => [
        { type: "BookAlignmentReport", id: uuid },
        "Books",
      ],
    }),
    metadataSearch: build.query<
      BookMetadataSearchResult[],
      Omit<MetadataSearchQuery, "providers">
    >({
      query: (params) => ({ url: "/metadata", params }),
    }),
    metadataBook: build.query<
      BookMetadataCandidate,
      { provider: BookMetadataProvider; id: string; region?: string }
    >({
      query: (params) => ({ url: "/metadata/book", params }),
    }),
    metadataCoverSearch: build.query<
      CoverCandidate[],
      Omit<CoverSearchQuery, "providers">
    >({
      query: (params) => ({ url: "/metadata/covers", params }),
    }),
    getMetadataProviders: build.query<MetadataProvidersResponse, void>({
      query: () => "/metadata/providers",
      providesTags: ["MetadataProviders"],
    }),
    setHardcoverToken: build.mutation<MetadataProvidersResponse, string>({
      query: (token) => ({
        url: "/metadata/providers",
        method: "PUT",
        body: { token },
      }),
      invalidatesTags: ["MetadataProviders"],
    }),
    clearHardcoverToken: build.mutation<MetadataProvidersResponse, void>({
      query: () => ({ url: "/metadata/providers", method: "DELETE" }),
      invalidatesTags: ["MetadataProviders"],
    }),
    importBookMetadata: build.mutation<
      BookWithRelations,
      { bookUuid: UUID } & MetadataImportBody
    >({
      query: ({ bookUuid, ...body }) => ({
        url: `/books/${bookUuid}/metadata-import`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { bookUuid }) => [
        "Creators",
        "Authors",
        "Narrators",
        "Series",
        "Tags",
        "Books",
        "Identifiers",
        { type: "Books", id: bookUuid },
        { type: "BookIdentifiers", id: bookUuid },
      ],
    }),
    autoImportBookMetadata: build.mutation<
      AutoImportResult,
      { bookUuid: UUID }
    >({
      query: ({ bookUuid }) => ({
        url: `/books/${bookUuid}/metadata-auto-import`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { bookUuid }) => [
        { type: "Books", id: bookUuid },
        { type: "BookIdentifiers", id: bookUuid },
      ],
    }),
    refreshBookRatings: build.mutation<BookWithRelations, { bookUuid: UUID }>({
      query: ({ bookUuid }) => ({
        url: `/books/${bookUuid}/ratings-refresh`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { bookUuid }) => [
        { type: "Books", id: bookUuid },
      ],
    }),
    deleteExternalRating: build.mutation<
      BookWithRelations,
      { bookUuid: UUID; ratingUuid: UUID }
    >({
      query: ({ bookUuid, ratingUuid }) => ({
        url: `/books/${bookUuid}/external-ratings/${ratingUuid}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { bookUuid }) => [
        { type: "Books", id: bookUuid },
      ],
    }),
    importBookCover: build.mutation<
      BookWithRelations,
      { bookUuid: UUID } & CoverImportRequest
    >({
      query: ({ bookUuid, ...body }) => ({
        url: `/books/${bookUuid}/cover-import`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { bookUuid }) => [
        "Books",
        { type: "Books", id: bookUuid },
      ],
    }),
  }),
})

export const {
  useAddBooksToCollectionsMutation,
  useAddBooksToSeriesMutation,
  useAddTagsToBooksMutation,
  useAddCreatorsToBooksMutation,
  useRemoveCreatorsFromBooksMutation,
  useCancelProcessingMutation,
  useGetScanStateQuery,
  useCreateBookMutation,
  useCreateCollectionMutation,
  useCreateInviteMutation,
  useClearBooksCacheMutation,
  useGetBooksCacheUsageQuery,
  useGetMaintenanceStorageQuery,
  useClearImageCacheMutation,
  useClearStaleUploadsMutation,
  useDeleteAllLogsMutation,
  useGetOrphansQuery,
  useDeleteOrphanFoldersMutation,
  useDeleteUnusedImagesMutation,
  useRecomputeAlignmentReportsMutation,
  useDeleteBookAssetsMutation,
  useDeleteBookMutation,
  useDeleteBooksMutation,
  useReplaceBookAssetMutation,
  useRemoveBookAssetMutation,
  useUpdateBookAssetDirMutation,
  useRelocateToInternalMutation,
  useBulkRelocateToInternalMutation,
  useGetPositionQuery,
  useGetBookQuery,
  useUpdatePositionMutation,
  useDeleteCollectionMutation,
  useDeleteInviteMutation,
  useDeleteSeriesMutation,
  useDeleteUserMutation,
  useGetCurrentUserQuery,
  useGetGpuBuildWarningQuery,
  useGetMaxUploadChunkSizeQuery,
  useGetServerCapabilitiesQuery,
  useTestCtcServerMutation,
  useLazyListCollectionsQuery,
  useLazyListCreatorsQuery,
  useLazyListSeriesQuery,
  useLazyListTagsQuery,
  useListAuthorsQuery,
  useListNarratorsQuery,
  useListTranslatorsQuery,
  useListCreatorsQuery,
  useGetCreatorQuery,
  useListDistinctFieldValuesQuery,
  useListBooksQuery,
  useListNextUpBooksQuery,
  useListInfiniteBooksInfiniteQuery,
  useListCollectionsQuery,
  useListInvitesQuery,
  useListSeriesQuery,
  useGetLibraryCountsQuery,
  useGetSectionFacetsQuery,
  useGetBooksCountQuery,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  usePrefetch,
  useListStatusesQuery,
  useListTagsQuery,
  useListUsersQuery,
  useMergeBooksMutation,
  useProcessBookMutation,
  useGetJobsQuery,
  useGetAlignmentEstimateQuery,
  useGetBookAlignmentReportQuery,
  useGetBookChapterTextQuery,
  useGetBookChapterGuidedNavigationQuery,
  useGetBookChapterAudioQuery,
  useGetTranscodedAudioQuery,
  useGetBookAlignmentDecisionsQuery,
  useUpdateBookAlignmentDecisionsMutation,
  useUpdateBookAlignmentOverridesMutation,
  useCancelJobMutation,
  useReorderJobsMutation,
  usePauseJobMutation,
  useResumeJobMutation,
  useTriggerBookScanMutation,
  useCancelScanMutation,
  useTriggerScanMutation,
  useScanBooksMutation,
  useRemoveBooksFromCollectionsMutation,
  useRemoveBooksFromSeriesMutation,
  useRemoveTagsFromBooksMutation,
  useResendInviteMutation,
  useSendPasswordResetMutation,
  useUpdateBookMutation,
  useUpdateCollectionMutation,
  useUpdateReadingStatusMutation,
  useUpdateSeriesMutation,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useUploadImageMutation,
  useUpdatePreferenceDefaultsMutation,
  useUpdateStatusMutation,
  useUpdateStatusLabelMutation,
  useCreateStatusMutation,
  useDeleteStatusMutation,
  useSetLibraryDefaultStatusMutation,
  useUpdateUserMutation,
  useGetChangelogQuery,
  useGetLatestChangelogQuery,
  useUpgradeBookEpubMutation,
  useGetImportRulesQuery,
  useGetUserImportRulesQuery,
  useCreateImportRuleMutation,
  useUpdateImportRuleMutation,
  useDeleteImportRuleMutation,
  useDeleteImportRulesMutation,
  useGetUserBookRatingQuery,
  useSetUserBookRatingMutation,
  useDeleteUserBookRatingMutation,
  useListUserBookRatingsQuery,
  useGetHomeStatsQuery,
  useListHomeSectionsQuery,
  useSetHomeSectionsMutation,
  useUpdateHomeSectionMutation,
  useListSidebarGroupsQuery,
  useSetSidebarGroupsMutation,
  useListUserShelvesQuery,
  useCreateUserShelfMutation,
  useUpdateUserShelfMutation,
  useDeleteUserShelfMutation,
  useListShelfBooksQuery,
  useListInfiniteShelfBooksInfiniteQuery,
  usePreviewShelfFilterMutation,
  useGetUserSettingsQuery,
  useUpdateUserSettingsMutation,
  useSetUserSettingMutation,
  useSetUserSettingRawMutation,
  useDismissAnnouncementMutation,
  useCreateTagMutation,
  useUpdateTagMutation,
  useDeleteTagMutation,
  useMergeTagsMutation,
  useUpdateCreatorMutation,
  useDeleteCreatorMutation,
  useMergeCreatorsMutation,
  useMergeSeriesMutation,
  useMergeCollectionsMutation,
  useGetLogsQuery,
  useGetLogLevelQuery,
  useSetLogLevelMutation,
  useClearLogsMutation,
  useGetBackupsQuery,
  useCreateBackupMutation,
  useDeleteBackupMutation,
  useGetPathsStatusQuery,
  usePreviewPathRewriteMutation,
  useApplyPathRewriteMutation,
  useAcknowledgePathsMutation,
  useListIdentifierTypesQuery,
  useCreateIdentifierTypeMutation,
  useUpdateIdentifierTypeMutation,
  useDeleteIdentifierTypeMutation,
  useMergeIdentifierTypesMutation,
  useListBookIdentifiersQuery,
  useUpdateBookIdentifiersMutation,
  useLazyMetadataSearchQuery,
  useLazyMetadataBookQuery,
  useMetadataCoverSearchQuery,
  useGetMetadataProvidersQuery,
  useSetHardcoverTokenMutation,
  useClearHardcoverTokenMutation,
  useImportBookMetadataMutation,
  useAutoImportBookMetadataMutation,
  useRefreshBookRatingsMutation,
  useDeleteExternalRatingMutation,
  useImportBookCoverMutation,
  useGetBookOpfQuery,
  useGetBookMediaOverlayQuery,
} = api

export function getDownloadUrl(
  bookUuid: string,
  format: "readaloud" | "audiobook" | "ebook",
) {
  const searchParams = new URLSearchParams({ format })
  return `/api/v2/books/${bookUuid}/files?${searchParams.toString()}`
}

export function getImageUrl(sha256: string, size?: number | null) {
  if (!size || !Number.isFinite(size) || size <= 0) {
    return `/api/v2/images/${sha256}`
  }
  return `/api/v2/images/${sha256}?s=${Math.round(size)}`
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

export type ListBooksQueryArg = {
  limit?: number | undefined
  orderBy?: SortField | undefined
  orderDirection?: "asc" | "desc" | undefined
  search?: string | undefined
  collection?: string | undefined
  series?: string | undefined
  filter?: ShelfFilter | undefined
}

export type ListShelfBooksQueryArg = {
  shelfUuid: string
  limit?: number | undefined
  sortField?: SortField | undefined
  orderBy?: ShelfOrderBy | undefined
  orderDirection?: "asc" | "desc" | undefined
  search?: string | undefined
  filter?: ShelfFilter | undefined
}
