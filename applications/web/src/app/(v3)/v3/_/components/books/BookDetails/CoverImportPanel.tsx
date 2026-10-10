"use client"

import { type UIEvent, useState } from "react"

import {
  COVER_PROVIDERS,
  type CoverCandidate,
  type CoverProvider,
} from "@storyteller-platform/nodekit/types"

import { Button } from "@v3/_/components/ui/button"
import { DialogFooter } from "@v3/_/components/ui/dialog"
import { Skeleton } from "@v3/_/components/ui/skeleton"
import { Spinner } from "@v3/_/components/ui/spinner"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { defaultSearchQuery } from "@/app/(v3)/v3/_/components/books/BookDetails/MetadataImportPanel"
import {
  MetadataUnavailable,
  ProviderSearchError,
  providerErrorCode,
} from "@/app/(v3)/v3/_/components/metadata/provider-notice"
import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import { PROVIDER_LABELS } from "@/externalSource"
import * as icon from "@/icons"
import { type CoverSide, coverSidesOf } from "@/metadataImportTypes"
import {
  getImageUrl,
  useGetMetadataProvidersQuery,
  useImportBookCoverMutation,
  useMetadataCoverSearchQuery,
} from "@/store/api"

const SIDE_MEDIA_KIND = {
  text: "ebook",
  audio: "audiobook",
} as const satisfies Record<CoverSide, CoverCandidate["mediaKind"]>

type ProviderCovers = {
  provider: CoverProvider
  candidates: CoverCandidate[]
  loading: boolean
  error: string | null
  retry: () => void
}

const SKELETON_TILES = 6

function area(candidate: CoverCandidate) {
  return (candidate.width ?? 0) * (candidate.height ?? 0)
}

export function CoverImportPanel({
  book,
  query,
  onClose,
}: {
  book: BookWithRelations
  query: string
  onClose: () => void
}) {
  const t = useTranslation("BookDetailsPage.coverImport")
  const c = useCommon()

  const sides = coverSidesOf(book)
  const [selection, setSelection] = useState<
    Partial<Record<CoverSide, CoverCandidate>>
  >({})

  const { data: providerStatus, isLoading: loadingStatus } =
    useGetMetadataProvidersQuery()
  const available = providerStatus?.available ?? false

  const [opened] = useState(() => ({
    query: defaultSearchQuery(book),
    title: book.title,
    author: book.authors[0]?.name,
  }))
  const term = query.trim()
  const search =
    term === opened.query
      ? { title: opened.title, author: opened.author }
      : { query: term }
  const options = { skip: !available || !term }
  const results = {
    apple: useMetadataCoverSearchQuery(
      { ...search, provider: "apple" },
      options,
    ),
    hardcover: useMetadataCoverSearchQuery(
      { ...search, provider: "hardcover" },
      options,
    ),
  } satisfies Record<CoverProvider, unknown>

  const providers = COVER_PROVIDERS.map((provider): ProviderCovers => ({
    provider,
    candidates: [...(results[provider].currentData ?? [])].sort(
      (a, b) => area(b) - area(a),
    ),
    loading: results[provider].isFetching,
    error: results[provider].isError
      ? (providerErrorCode(results[provider].error) ?? "failed")
      : null,
    retry: () => {
      void results[provider].refetch()
    },
  }))

  const [compact, setCompact] = useState(false)
  const [applied, setApplied] = useState(false)
  const [importCover, { isLoading: isApplying, isError: applyFailed }] =
    useImportBookCoverMutation()

  const handleApply = async () => {
    try {
      await importCover({
        bookUuid: book.uuid,
        search,
        covers: sides.flatMap((side) => {
          const candidate = selection[side]
          return candidate
            ? [{ side, provider: candidate.provider, id: candidate.id }]
            : []
        }),
      }).unwrap()
      setSelection({})
      setApplied(true)
    } catch {
      return
    }
  }

  const selectedCount = sides.filter((side) => selection[side]).length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {loadingStatus ? (
        <div className="flex flex-1 justify-center py-16">
          <Spinner />
        </div>
      ) : !available ? (
        <div className="flex flex-1 justify-center py-16">
          <MetadataUnavailable />
        </div>
      ) : (
        <div
          className="scroll-y min-h-0 flex-1"
          onScroll={(event: UIEvent<HTMLDivElement>) => {
            setCompact(event.currentTarget.scrollTop > 16)
          }}
        >
          <div className="bg-background sticky top-0 z-10 grid auto-cols-fr grid-flow-col gap-4 border-b px-4 py-3">
            {sides.map((side) => (
              <CoverSlot
                key={side}
                book={book}
                side={side}
                selected={selection[side] ?? null}
                compact={compact}
                onRevert={() => {
                  setSelection((state) => ({ ...state, [side]: undefined }))
                }}
              />
            ))}
          </div>

          <div
            className={cn(
              "grid gap-x-6 gap-y-8 p-4",
              sides.length === 2 && "md:grid-cols-2",
            )}
          >
            {sides.map((side) => (
              <SideCandidates
                key={side}
                side={side}
                showTitle={sides.length === 2}
                providers={providers.map((entry) => ({
                  ...entry,
                  candidates: entry.candidates.filter(
                    (candidate) =>
                      candidate.mediaKind === SIDE_MEDIA_KIND[side],
                  ),
                }))}
                selected={selection[side] ?? null}
                onSelect={(candidate) => {
                  setSelection((state) => ({
                    ...state,
                    [side]:
                      state[side]?.id === candidate.id ? undefined : candidate,
                  }))
                }}
              />
            ))}
          </div>
        </div>
      )}

      <DialogFooter className="flex-row items-center border-t px-6 py-3">
        <span className="text-muted-foreground flex-1 text-sm">
          {applyFailed ? (
            <span className="text-destructive">{t("failed")}</span>
          ) : applied && selectedCount === 0 ? (
            <span className="text-foreground inline-flex items-center gap-1.5">
              <icon.Check className="size-3.5" />
              {t("applied")}
            </span>
          ) : (
            t("selectedCount", { count: selectedCount })
          )}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={isApplying}
          onClick={onClose}
        >
          {c("actions.close")}
        </Button>
        <Button
          type="button"
          disabled={selectedCount === 0 || isApplying}
          onClick={() => {
            void handleApply()
          }}
        >
          {isApplying && <Spinner className="size-3.5" />}
          {c("actions.apply")}
        </Button>
      </DialogFooter>
    </div>
  )
}

function CoverSlot({
  book,
  side,
  selected,
  compact,
  onRevert,
}: {
  book: BookWithRelations
  side: CoverSide
  selected: CoverCandidate | null
  compact: boolean
  onRevert: () => void
}) {
  const t = useTranslation("BookDetailsPage.coverImport")
  const current =
    side === "audio"
      ? book.audiobook?.cover
      : (book.ebook?.cover ?? book.readaloud?.cover)
  const square = side === "audio"
  const previewUrl =
    selected?.url ?? (current ? getImageUrl(current.sha256, 400) : null)

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={cn(
          "bg-muted flex shrink-0 items-center justify-center overflow-hidden rounded-xs shadow-sm motion-safe:transition-[height] motion-safe:duration-200",
          compact ? "h-14" : "h-28",
          selected && "ring-primary ring-2 ring-offset-2",
        )}
        style={{ aspectRatio: square ? "1 / 1" : "2 / 3" }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <icon.Image className="text-muted-foreground size-5" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-center gap-1.5 font-medium">
          {square ? (
            <icon.Headphones className="size-3.5 shrink-0" />
          ) : (
            <icon.BookAlt className="size-3.5 shrink-0" />
          )}
          <span className="truncate">
            {square ? t("audioSide") : t("textSide")}
          </span>
        </div>
        <div className="text-muted-foreground truncate text-xs">
          {selected
            ? [
                PROVIDER_LABELS[selected.provider],
                selected.width && selected.height
                  ? `${selected.width} × ${selected.height}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : current
              ? t("currentCover")
              : t("noCover")}
        </div>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground mt-1 -ml-2"
            onClick={onRevert}
          >
            <icon.Undo className="size-3.5" />
            {current ? t("keepCurrent") : t("keepNone")}
          </Button>
        )}
      </div>
    </div>
  )
}

function SideCandidates({
  side,
  showTitle,
  providers,
  selected,
  onSelect,
}: {
  side: CoverSide
  showTitle: boolean
  providers: ProviderCovers[]
  selected: CoverCandidate | null
  onSelect: (candidate: CoverCandidate) => void
}) {
  const t = useTranslation("BookDetailsPage.coverImport")
  const square = side === "audio"
  const aspectRatio = square ? "1 / 1" : "2 / 3"

  return (
    <section className="flex min-w-0 flex-col gap-4">
      {showTitle && (
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {square ? (
            <icon.Headphones className="size-4" />
          ) : (
            <icon.BookAlt className="size-4" />
          )}
          {square ? t("audioSide") : t("textSide")}
        </h3>
      )}
      {providers.map(({ provider, candidates, loading, error, retry }) => (
        <div key={provider} className="flex flex-col gap-2">
          <h4 className="text-muted-foreground flex h-6 items-center gap-1 text-xs font-semibold">
            {PROVIDER_LABELS[provider]}
            {error && !loading && (
              <TooltipButton
                variant="ghost"
                size="icon-xs"
                tooltip={t("refresh")}
                aria-label={t.plain("refresh")}
                onClick={retry}
              >
                <icon.Refresh className="size-3.5" />
              </TooltipButton>
            )}
          </h4>
          {loading && !candidates.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
              {Array.from({ length: SKELETON_TILES }, (_, index) => (
                <Skeleton
                  key={index}
                  className="m-1 rounded-xs"
                  style={{ aspectRatio }}
                />
              ))}
            </div>
          ) : error ? (
            <ProviderSearchError
              code={error}
              provider={PROVIDER_LABELS[provider]}
            />
          ) : candidates.length === 0 ? (
            <p className="text-muted-foreground/70 text-xs italic">
              {t("noCandidates")}
            </p>
          ) : (
            <div
              className={cn(
                "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3 transition-opacity",
                loading && "opacity-60",
              )}
            >
              {candidates.map((candidate) => {
                const active = selected?.id === candidate.id
                return (
                  <div key={candidate.id} className="group/candidate relative">
                    <button
                      type="button"
                      aria-pressed={active}
                      title={candidate.title}
                      onClick={() => {
                        onSelect(candidate)
                      }}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-md p-1 text-left transition-colors",
                        active
                          ? "bg-primary/10 ring-primary ring-2"
                          : "hover:bg-muted/60",
                      )}
                    >
                      <img
                        src={candidate.url}
                        alt=""
                        loading="lazy"
                        className="w-full rounded-xs object-cover shadow-sm"
                        style={{ aspectRatio }}
                      />
                      {candidate.width && candidate.height ? (
                        <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
                          {candidate.width} × {candidate.height}
                        </span>
                      ) : null}
                    </button>
                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t.plain("preview")}
                      title={t.plain("preview")}
                      className="bg-background/85 text-foreground/70 hover:text-foreground absolute top-2 right-2 rounded-full p-1 opacity-0 transition-opacity group-hover/candidate:opacity-100 focus-visible:opacity-100"
                    >
                      <icon.ExternalLink className="size-3" />
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
