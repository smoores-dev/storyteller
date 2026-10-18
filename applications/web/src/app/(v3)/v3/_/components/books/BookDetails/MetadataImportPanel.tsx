"use client"

import { useLocale } from "next-intl"
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  type BookMetadataCandidate,
  type BookMetadataProvider,
  type BookMetadataSearchResult,
  type MetadataEdition,
} from "@storyteller-platform/nodekit/types"

import { Button } from "@v3/_/components/ui/button"
import { DialogFooter } from "@v3/_/components/ui/dialog"
import { InfoTip } from "@v3/_/components/ui/info-tip"
import { Input } from "@v3/_/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { Skeleton } from "@v3/_/components/ui/skeleton"
import { Spinner } from "@v3/_/components/ui/spinner"
import { SwipePanels } from "@v3/_/components/ui/swipe-panels"
import { Tabs, TabsList, TabsTrigger } from "@v3/_/components/ui/tabs"
import { Textarea } from "@v3/_/components/ui/textarea"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { RatingValue } from "@/app/(v3)/v3/_/components/books/BookDetails/ExternalRating"
import { ContributorRolePicker } from "@/app/(v3)/v3/_/components/books/BookDetails/sections/ContributorsSection"
import {
  LanguagePreview,
  describeLanguage,
} from "@/app/(v3)/v3/_/components/books/LanguageEdit"
import { RelationChipField } from "@/app/(v3)/v3/_/components/books/RelationFormField"
import { SelectionBullet } from "@/app/(v3)/v3/_/components/books/SelectionCheckbox"
import { FieldChip } from "@/app/(v3)/v3/_/components/field-chip"
import {
  MetadataUnavailable,
  ProviderSearchError,
  providerErrorCode,
} from "@/app/(v3)/v3/_/components/metadata/provider-notice"
import { SourceIcon } from "@/app/(v3)/v3/_/components/metadata/source-icon"
import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import { getCoreIdentifier } from "@/database/identifierKinds"
import {
  KNOWN_SOURCES,
  PROVIDER_LABELS,
  PROVIDER_SOURCES,
  knownSource,
} from "@/externalSource"
import {
  ASSET_FORMATS,
  FIELD_REGISTRY,
  IMPORT_EACH_FIELDS,
  type ImportEachField,
  IMPORTABLE_FIELDS,
  type ImportableField,
} from "@/fields"
import * as icon from "@/icons"
import { identifierKey, proposedIdentifiers } from "@/metadata/identifiers"
import { DEFAULT_CREATOR_ROLE } from "@/metadata/marcRelators"
import {
  type MatchConfidence,
  type MatchSubject,
  candidateFromSearchResult,
  rankEditionMatches,
  rankMatches,
} from "@/metadata/match"
import { subjectFromBook } from "@/metadata/subject"
import {
  type ImportFields,
  type ImportSource,
  type MetadataImportBody,
  type SelectedIdentifier,
  candidateFieldValue,
} from "@/metadataImportTypes"
import {
  useGetMetadataProvidersQuery,
  useImportBookMetadataMutation,
  useLazyMetadataBookQuery,
  useLazyMetadataSearchQuery,
} from "@/store/api"

const AUDIBLE_REGION_COUNTRIES = {
  us: "US",
  ca: "CA",
  uk: "GB",
  au: "AU",
  fr: "FR",
  de: "DE",
  jp: "JP",
  it: "IT",
  in: "IN",
  es: "ES",
} as const

const PANE_OPEN_QUERY = "(min-width: 80rem)"

function searchKey(
  provider: BookMetadataProvider,
  term: string,
  region: string,
) {
  return provider === "audnexus" ? `${term.trim()}|${region}` : term.trim()
}

function flagEmoji(country: string) {
  return String.fromCodePoint(
    0x1f1e6 + country.charCodeAt(0) - 65,
    0x1f1e6 + country.charCodeAt(1) - 65,
  )
}

type IdentifierScope = "book" | "ebook" | "audiobook" | "readaloud"

const IDENTIFIER_SCOPES = [
  "book",
  "ebook",
  "audiobook",
  "readaloud",
] as const satisfies readonly IdentifierScope[]

type Creator = { name: string; role: string }

type Chip = {
  key: string
  label: string
  scope?: IdentifierScope
  value?: string | Creator
  identifier?: SelectedIdentifier
  rating?: {
    value: number
    logo?: string | undefined
    color?: string | null | undefined
  }
}

type SetField = ImportEachField | "identifiers" | "rating"
const SET_FIELDS = [...IMPORT_EACH_FIELDS, "identifiers", "rating"] as const
type ScalarField = Exclude<ImportableField, ImportEachField>
const SCALAR_FIELDS = IMPORTABLE_FIELDS.filter(
  (field): field is ScalarField => FIELD_REGISTRY[field].importable === "whole",
)
type DialogRow = ImportableField | "identifiers" | "rating"

function isSetField(row: DialogRow): row is SetField {
  return (SET_FIELDS as readonly string[]).includes(row)
}

function creatorKey(creator: { name: string; role: string | null }) {
  return `${creator.name}|${creator.role ?? ""}`
}

function creatorChip(creator: Creator): Chip {
  return {
    key: creatorKey(creator),
    label: creator.role ? `${creator.name} (${creator.role})` : creator.name,
    value: creator,
  }
}

function nameChip(name: string): Chip {
  return { key: name, label: name, value: name }
}

function identifierChip(identifier: { kind: string; value: string }): Chip {
  return {
    key: identifierKey(identifier),
    label: `${getCoreIdentifier(identifier.kind)?.displayName ?? identifier.kind} ${identifier.value}`,
    scope: "book",
  }
}

type Origin =
  | { kind: "current" }
  | { kind: "edited" }
  | { kind: "provider"; provider: BookMetadataProvider }

const CURRENT_ORIGIN: Origin = { kind: "current" }
const EDITED_ORIGIN: Origin = { kind: "edited" }

type ResultChip = {
  chip: Chip
  state: "kept" | "added" | "removed"
  origin: Origin
  locked: boolean
}

type TextField = Exclude<ScalarField, "series">
type SeriesValue = NonNullable<ImportFields["series"]>
type ScalarEdits = Partial<Record<TextField, string>> & {
  series?: SeriesValue
}

type ScalarEditor = "text" | "textarea" | "date" | "language"

function scalarEditor(field: TextField): ScalarEditor {
  switch (field) {
    case "description":
      return "textarea"
    case "publicationDate":
    case "releaseDate":
      return "date"
    case "language":
      return "language"
    default:
      return "text"
  }
}

function seriesKey(entry: SeriesValue[number]) {
  return `${entry.name}#${entry.position ?? ""}`
}

function sameSeries(a: SeriesValue, b: SeriesValue) {
  return a.map(seriesKey).join("|") === b.map(seriesKey).join("|")
}

function originColor(origin: Origin): string | null {
  switch (origin.kind) {
    case "provider":
      return KNOWN_SOURCES[PROVIDER_SOURCES[origin.provider]].color
    case "edited":
      return "var(--primary)"
    case "current":
      return null
  }
}

function originStyle(color: string | null): CSSProperties | undefined {
  return color ? ({ "--origin": color } as CSSProperties) : undefined
}

const ORIGIN_TINT =
  "border-[color-mix(in_oklab,var(--origin)_45%,transparent)] bg-[color-mix(in_oklab,var(--origin)_9%,transparent)]"

const RESULT_EDGE = "border-l"

const CELL_BOX = "rounded-lg border border-transparent px-3 py-2 text-sm/5"

const EDIT_BOX =
  "rounded-sm border px-2 py-1 text-sm/5 md:text-sm/5 [overflow-wrap:anywhere]"

const CONFIDENCE_STYLES: Record<MatchConfidence, string> = {
  certain: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  low: "bg-muted text-muted-foreground",
}

type ScoredResult = {
  result: BookMetadataSearchResult
  score: number
  confidence: MatchConfidence
}

type ProviderState = {
  results: ScoredResult[]
  selectedId: string | null
  candidateId: string | null
  candidate: BookMetadataCandidate | null
  editionsById: Record<string, MetadataEdition[]>
  editionId: string | null
  expandedId: string | null
  loadingEditionsId: string | null
  searching: boolean
  loadingCandidate: boolean
  error: string | null
}

const EMPTY_PROVIDER_STATE: ProviderState = {
  results: [],
  selectedId: null,
  candidateId: null,
  candidate: null,
  editionsById: {},
  editionId: null,
  expandedId: null,
  loadingEditionsId: null,
  searching: false,
  loadingCandidate: false,
  error: null,
}

type Column = {
  provider: BookMetadataProvider
  candidate: BookMetadataCandidate | null
  identifierChips: Chip[]
  ratingChips: Chip[]
  loading: boolean
}

function columnFieldValue<Field extends ImportableField>(
  column: Column,
  field: Field,
): ImportFields[Field] | undefined {
  if (!column.candidate) return undefined
  return candidateFieldValue(column.candidate, field)
}

function rankEditions(
  subject: MatchSubject,
  candidate: BookMetadataCandidate,
): MetadataEdition[] {
  const byId = new Map(
    (candidate.editions ?? []).map((edition) => [edition.id, edition]),
  )
  return rankEditionMatches(subject, candidate).flatMap((entry) => {
    const edition = entry.candidate.editionId
      ? byId.get(entry.candidate.editionId)
      : undefined
    return edition ? [edition] : []
  })
}

function formatFieldValue(
  field: ScalarField,
  value: ImportFields[ScalarField] | undefined,
): string | null {
  if (value == null) return null
  switch (field) {
    case "publicationDate":
    case "releaseDate":
      return (value as string).slice(0, 10)
    case "series":
      return (
        (value as { name: string; position?: string | number | null }[])
          .map((series) =>
            series.position != null
              ? `${series.name} #${series.position}`
              : series.name,
          )
          .join(", ") || null
      )
    default:
      return (value as string) || null
  }
}

function currentFieldValue(
  book: BookWithRelations,
  field: ScalarField,
): string | null {
  switch (field) {
    case "title":
      return book.title || null
    case "subtitle":
      return book.subtitle
    case "description":
      return book.description
    case "language":
      return book.language
    case "publicationDate":
      return book.publicationDate?.slice(0, 10) ?? null
    case "releaseDate":
      return book.releaseDate?.slice(0, 10) ?? null
    case "series":
      return formatFieldValue("series", book.series)
  }
}

export const SEARCH_REGION = "us"

export function searchProvidersFor(book: {
  audiobook: unknown
  readaloud: unknown
}): BookMetadataProvider[] {
  return book.audiobook || book.readaloud
    ? ["audnexus", "hardcover"]
    : ["hardcover"]
}

export function defaultSearchQuery(book: BookWithRelations): string {
  return [book.title, book.authors[0]?.name].filter(Boolean).join(" ")
}

export type ImportStep = {
  index: number
  count: number
  onSkip: () => void
  onBack?: (() => void) | undefined
}

export function MetadataImportPanel({
  book,
  query,
  onClose,
  onImported,
  step,
}: {
  book: BookWithRelations
  query: string
  onClose: () => void
  onImported?: (() => void) | undefined
  step?: ImportStep | undefined
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  const c = useCommon()

  const { data: providerStatus, isLoading: loadingStatus } =
    useGetMetadataProvidersQuery()
  const available = providerStatus?.available ?? false

  const availableProviders = useMemo(() => searchProvidersFor(book), [book])

  const [activeProvider, setActiveProvider] = useState<BookMetadataProvider>(
    availableProviders[0] ?? "hardcover",
  )
  const [region, setRegion] = useState(SEARCH_REGION)
  const [paneOpen, setPaneOpen] = useState(
    () =>
      typeof window === "undefined" ||
      window.matchMedia(PANE_OPEN_QUERY).matches,
  )
  const [scalarEdits, setScalarEdits] = useState<ScalarEdits>({})
  const [customChips, setCustomChips] = useState<
    Partial<Record<SetField, Chip[]>>
  >({})
  const [sources, setSources] = useState<
    Record<BookMetadataProvider, ProviderState>
  >({ audnexus: EMPTY_PROVIDER_STATE, hardcover: EMPTY_PROVIDER_STATE })
  const [scalarChoice, setScalarChoice] = useState<
    Partial<Record<ScalarField, BookMetadataProvider>>
  >({})
  const [chipChoice, setChipChoice] = useState<
    Partial<Record<SetField, Set<string>>>
  >({})
  const [expandedFields, setExpandedFields] = useState<Set<ScalarField>>(
    new Set(),
  )
  const [appliedTo, setAppliedTo] = useState<BookWithRelations | null>(null)
  const [applied, setApplied] = useState(false)
  if (appliedTo && appliedTo !== book) {
    setAppliedTo(null)
    undoAll()
  }

  const [search] = useLazyMetadataSearchQuery()
  const [fetchCandidate] = useLazyMetadataBookQuery()
  const [importMetadata, { isLoading: isImporting, error: importError }] =
    useImportBookMetadataMutation()

  const patchProvider = useCallback(
    (
      provider: BookMetadataProvider,
      patch:
        | Partial<ProviderState>
        | ((state: ProviderState) => Partial<ProviderState>),
    ) => {
      setSources((state) => ({
        ...state,
        [provider]: {
          ...state[provider],
          ...(typeof patch === "function" ? patch(state[provider]) : patch),
        },
      }))
    },
    [],
  )

  const resetProposedChips = useCallback(() => {
    setChipChoice((state) => ({
      ...state,
      identifiers: undefined,
      rating: undefined,
    }))
  }, [])

  const subject = useMemo(() => subjectFromBook(book), [book])

  const loadEditions = useCallback(
    async (provider: BookMetadataProvider, id: string) => {
      const candidate = await fetchCandidate(
        { provider, id, region },
        true,
      ).unwrap()
      const editions = rankEditions(subject, candidate)
      patchProvider(provider, (state) => ({
        editionsById: { ...state.editionsById, [id]: editions },
      }))
      return { candidate, editions }
    },
    [fetchCandidate, patchProvider, region, subject],
  )

  const selectResult = useCallback(
    async (
      provider: BookMetadataProvider,
      id: string,
      preferredEditionId?: string | null,
    ) => {
      patchProvider(provider, {
        selectedId: id,
        loadingCandidate: true,
        editionId: preferredEditionId ?? null,
      })
      resetProposedChips()
      try {
        const { candidate, editions } = await loadEditions(provider, id)
        patchProvider(provider, (state) =>
          state.selectedId === id
            ? {
                candidate,
                candidateId: id,
                loadingCandidate: false,
                editionId:
                  preferredEditionId === undefined
                    ? (editions[0]?.id ?? null)
                    : preferredEditionId,
              }
            : {},
        )
      } catch (error) {
        patchProvider(provider, (state) =>
          state.selectedId === id
            ? {
                candidate: null,
                candidateId: null,
                loadingCandidate: false,
                editionId: null,
                error: providerErrorCode(error) ?? "failed",
              }
            : {},
        )
      }
    },
    [loadEditions, patchProvider, resetProposedChips],
  )

  const latestSearch = useRef<Partial<Record<BookMetadataProvider, string>>>({})

  const runSearch = useCallback(
    async (provider: BookMetadataProvider, term: string) => {
      if (!term.trim()) return
      const key = searchKey(provider, term, region)
      latestSearch.current[provider] = key
      patchProvider(provider, { searching: true, error: null })
      try {
        const found = await search(
          { provider, query: term.trim(), region },
          true,
        ).unwrap()
        if (latestSearch.current[provider] !== key) return

        const byId = new Map(found.map((entry) => [entry.id, entry]))
        const results = rankMatches(
          subject,
          found.map(candidateFromSearchResult),
        ).flatMap((ranked) => {
          const result = byId.get(ranked.candidate.id)
          return result
            ? [{ result, score: ranked.score, confidence: ranked.confidence }]
            : []
        })

        patchProvider(provider, { ...EMPTY_PROVIDER_STATE, results })
        const first = results[0]
        if (first) void selectResult(provider, first.result.id)
      } catch (error) {
        if (latestSearch.current[provider] !== key) return
        patchProvider(provider, {
          ...EMPTY_PROVIDER_STATE,
          error: providerErrorCode(error) ?? "failed",
        })
      }
    },
    [patchProvider, region, search, selectResult, subject],
  )

  useEffect(() => {
    if (!available) return
    for (const provider of availableProviders) {
      const key = searchKey(provider, query, region)
      if (latestSearch.current[provider] === key) continue
      void runSearch(provider, query)
    }
  }, [available, availableProviders, query, region, runSearch])

  const liveSource = useCallback(
    (provider: BookMetadataProvider): ImportSource => {
      const state = sources[provider]
      return {
        provider,
        id:
          provider === "hardcover"
            ? (state.candidate?.id ?? state.candidateId ?? "")
            : (state.candidateId ?? ""),
        region,
        ...(state.editionId && { editionId: state.editionId }),
      }
    },
    [region, sources],
  )

  const currentIdentifierKeys = useMemo(
    () =>
      new Set(
        [
          book.identifiers,
          book.ebook?.identifiers ?? [],
          book.audiobook?.identifiers ?? [],
          book.readaloud?.identifiers ?? [],
        ]
          .flat()
          .flatMap((identifier) =>
            identifier.kind
              ? [
                  identifierKey({
                    kind: identifier.kind,
                    value: identifier.value,
                  }),
                ]
              : [],
          ),
      ),
    [book],
  )

  const columns = useMemo<Column[]>(
    () =>
      availableProviders.map((provider) => {
        const state = sources[provider]
        const candidate = state.candidate
        const live = candidate
        return {
          provider,
          candidate,
          identifierChips: live
            ? proposedIdentifiers(liveSource(provider), candidate)
                .filter(
                  (identifier) =>
                    !currentIdentifierKeys.has(identifierKey(identifier)),
                )
                .map((identifier) => ({
                  ...identifierChip(identifier),
                  identifier: {
                    kind: identifier.kind,
                    value: identifier.value,
                    provider: identifier.provider,
                  },
                }))
            : [],
          ratingChips:
            live && typeof candidate.rating === "number"
              ? [
                  {
                    key: provider,
                    label: KNOWN_SOURCES[PROVIDER_SOURCES[provider]].name,
                    rating: {
                      value: candidate.rating,
                      logo: KNOWN_SOURCES[PROVIDER_SOURCES[provider]].logo,
                      color: KNOWN_SOURCES[PROVIDER_SOURCES[provider]].color,
                    },
                  },
                ]
              : [],
          loading: state.loadingCandidate,
        }
      }),
    [availableProviders, currentIdentifierKeys, liveSource, sources],
  )

  const currentChips = useMemo<Record<SetField, Chip[]>>(
    () => ({
      authors: book.authors.map((author) => nameChip(author.name)),
      narrators: book.narrators.map((narrator) => nameChip(narrator.name)),
      creators: book.creators.map((creator) =>
        creatorChip({ name: creator.name, role: creator.role ?? "" }),
      ),
      tags: book.tags.map((tag) => nameChip(tag.name)),
      identifiers: (
        [
          ["book", book.identifiers],
          ["ebook", book.ebook?.identifiers ?? []],
          ["audiobook", book.audiobook?.identifiers ?? []],
          ["readaloud", book.readaloud?.identifiers ?? []],
        ] as const
      ).flatMap(([scope, identifiers]) =>
        identifiers.flatMap((identifier) =>
          identifier.kind
            ? [
                {
                  ...identifierChip({
                    kind: identifier.kind,
                    value: identifier.value,
                  }),
                  scope,
                },
              ]
            : [],
        ),
      ),
      rating: book.externalData.map((entry) => {
        const known = knownSource(entry)
        return {
          key: entry.uuid,
          label: entry.sourceName,
          rating: {
            value: entry.rating,
            logo: known?.logo,
            color: entry.sourceColor ?? known?.color,
          },
        }
      }),
    }),
    [book],
  )

  const chipsFor = useCallback((field: SetField, column: Column): Chip[] => {
    switch (field) {
      case "identifiers":
        return column.identifierChips
      case "rating":
        return column.ratingChips
      case "creators":
        return (columnFieldValue(column, "creators") ?? []).map(creatorChip)
      default:
        return (columnFieldValue(column, field) ?? []).map(nameChip)
    }
  }, [])

  const selectedChips = useCallback(
    (field: SetField): Set<string> =>
      chipChoice[field] ??
      new Set(
        field === "identifiers" || field === "rating"
          ? columns.flatMap((column) =>
              chipsFor(field, column).map((chip) => chip.key),
            )
          : currentChips[field].map((chip) => chip.key),
      ),
    [chipChoice, chipsFor, columns, currentChips],
  )

  const chipChanged = useCallback(
    (field: SetField): boolean => {
      const selected = selectedChips(field)
      if (field === "identifiers" || field === "rating") {
        return selected.size > 0
      }
      const current = currentChips[field]
      return (
        selected.size !== current.length ||
        current.some((chip) => !selected.has(chip.key))
      )
    },
    [currentChips, selectedChips],
  )

  const columnFor = (provider: BookMetadataProvider | undefined) =>
    columns.find((column) => column.provider === provider)

  const bookFormats = ASSET_FORMATS.filter((format) => !!book[format])
  const dialogRows: DialogRow[] = [
    ...IMPORTABLE_FIELDS.filter((field) => {
      const def = FIELD_REGISTRY[field]
      return (
        !("formats" in def) ||
        def.formats.some((format) => bookFormats.includes(format))
      )
    }),
    "identifiers",
    "rating",
  ]

  const changeCount = dialogRows.filter((row) => {
    if (isSetField(row)) return chipChanged(row)
    if (scalarEdits[row] !== undefined) return true
    const column = columnFor(scalarChoice[row])
    return column ? columnFieldValue(column, row) !== undefined : false
  }).length

  const resultScalar = (
    field: ScalarField,
  ): { value: string | null; origin: Origin } => {
    const edit = scalarEdits[field]
    if (edit !== undefined)
      return {
        value:
          typeof edit === "string"
            ? edit || null
            : formatFieldValue(field, edit),
        origin: EDITED_ORIGIN,
      }
    const provider = scalarChoice[field]
    const column = columnFor(provider)
    const value = column && columnFieldValue(column, field)
    if (provider && value !== undefined) {
      return {
        value: formatFieldValue(field, value),
        origin: { kind: "provider", provider },
      }
    }
    return { value: currentFieldValue(book, field), origin: CURRENT_ORIGIN }
  }

  const setRows = dialogRows.filter(isSetField)
  const currentChipKeys = useMemo(
    () =>
      Object.fromEntries(
        SET_FIELDS.map((field) => [
          field,
          new Set(currentChips[field].map((chip) => chip.key)),
        ]),
      ) as Record<SetField, Set<string>>,
    [currentChips],
  )

  const columnSelection = (column: Column) => {
    const scalars = SCALAR_FIELDS.filter(
      (field) =>
        dialogRows.includes(field) &&
        columnFieldValue(column, field) !== undefined,
    )
    const chips = setRows.flatMap((field) =>
      chipsFor(field, column)
        .filter((chip) => !currentChipKeys[field].has(chip.key))
        .map((chip) => ({ field, key: chip.key })),
    )
    const picked =
      scalars.filter(
        (field) =>
          scalarChoice[field] === column.provider &&
          scalarEdits[field] === undefined,
      ).length +
      chips.filter(({ field, key }) => selectedChips(field).has(key)).length
    return { total: scalars.length + chips.length, picked }
  }

  const providersUsed = columns
    .filter((column) => column.candidate && columnSelection(column).picked > 0)
    .map((column) => column.provider)
  const providersBusy = availableProviders.some(
    (provider) =>
      sources[provider].loadingCandidate || sources[provider].searching,
  )

  const handleImport = async () => {
    const fields: ImportFields = {}
    for (const field of SCALAR_FIELDS) {
      if (!dialogRows.includes(field)) continue
      const edit = scalarEdits[field]
      if (edit !== undefined) {
        fields[field] = (
          typeof edit === "string" ? edit || null : edit
        ) as never
        continue
      }
      const column = columnFor(scalarChoice[field])
      const value = column && columnFieldValue(column, field)
      if (!column || value === undefined) continue
      fields[field] = value as never
    }
    for (const field of IMPORT_EACH_FIELDS) {
      if (!dialogRows.includes(field) || !chipChanged(field)) continue
      const values = new Map(
        [
          ...currentChips[field],
          ...columns.flatMap((column) => chipsFor(field, column)),
          ...(customChips[field] ?? []),
        ].flatMap((chip) => (chip.value ? [[chip.key, chip.value]] : [])),
      )
      const selected = selectedChips(field)
      fields[field] = [...selected].flatMap((key) => {
        const value = values.get(key)
        return value ? [value] : []
      }) as never
    }

    const identifiers = new Map(
      columns.flatMap((column) =>
        column.identifierChips.flatMap((chip) =>
          chip.identifier ? [[chip.key, chip.identifier]] : [],
        ),
      ),
    )
    const selectedRatings = selectedChips("rating")

    const request: MetadataImportBody = {
      fields,
      sources: providersUsed.map(liveSource),
      identifiers: [...selectedChips("identifiers")].flatMap((key) => {
        const identifier = identifiers.get(key)
        return identifier ? [identifier] : []
      }),
      ratingProviders: availableProviders.filter((provider) =>
        selectedRatings.has(provider),
      ),
    }

    try {
      await importMetadata({ bookUuid: book.uuid, ...request }).unwrap()
      if (onImported) {
        onImported()
        return
      }
      setApplied(true)
      setAppliedTo(book)
    } catch {
      return
    }
  }

  const gridTemplate = `max-content repeat(${columns.length}, minmax(var(--provider-min), 1fr)) minmax(var(--result-min), 1.3fr)`

  const resultChips = (field: SetField): ResultChip[] => {
    const selected = selectedChips(field)
    const locked = field === "identifiers" || field === "rating"
    const seen = new Set(currentChipKeys[field])
    const entries: ResultChip[] = []
    for (const column of columns) {
      for (const chip of chipsFor(field, column)) {
        if (seen.has(chip.key) || !selected.has(chip.key)) continue
        seen.add(chip.key)
        entries.push({
          chip,
          state: "added",
          origin: { kind: "provider", provider: column.provider },
          locked: false,
        })
      }
    }
    for (const chip of customChips[field] ?? []) {
      if (seen.has(chip.key) || !selected.has(chip.key)) continue
      seen.add(chip.key)
      entries.push({
        chip,
        state: "added",
        origin: EDITED_ORIGIN,
        locked: false,
      })
    }
    const refreshed = new Set(
      field === "rating" ? entries.map((entry) => entry.chip.label) : [],
    )
    return [
      ...currentChips[field]
        .filter((chip) => !refreshed.has(chip.label))
        .map((chip): ResultChip => ({
          chip,
          state: locked || selected.has(chip.key) ? "kept" : "removed",
          origin: CURRENT_ORIGIN,
          locked,
        })),
      ...entries,
    ]
  }

  function chooseScalar(
    field: ScalarField,
    provider: BookMetadataProvider | undefined,
  ) {
    setScalarChoice((state) => ({ ...state, [field]: provider }))
    setScalarEdits((state) => ({ ...state, [field]: undefined }))
  }

  const currentSeries: SeriesValue = book.series.map((series) => ({
    name: series.name,
    position: series.position,
  }))

  const resultSeries = (): { value: SeriesValue; origin: Origin } => {
    const edit = scalarEdits.series
    if (edit !== undefined) return { value: edit, origin: EDITED_ORIGIN }
    const provider = scalarChoice.series
    const column = columnFor(provider)
    const value = column && columnFieldValue(column, "series")
    if (provider && value !== undefined) {
      return { value, origin: { kind: "provider", provider } }
    }
    return { value: currentSeries, origin: CURRENT_ORIGIN }
  }

  function editSeries(next: SeriesValue) {
    if (sameSeries(next, currentSeries)) {
      undoRow("series")
      return
    }
    setScalarEdits((state) => ({ ...state, series: next }))
  }

  function editScalar(field: TextField, draft: string) {
    const value = draft.trim()
    if (value === (resultScalar(field).value ?? "")) return
    if (field === "title" && !value) return
    if (value === (currentFieldValue(book, field) ?? "")) {
      undoRow(field)
      return
    }
    setScalarEdits((state) => ({ ...state, [field]: value }))
  }

  function setResultChips(field: ImportEachField, next: Chip[]) {
    const known = new Set(
      [
        ...currentChips[field],
        ...columns.flatMap((column) => chipsFor(field, column)),
        ...(customChips[field] ?? []),
      ].map((chip) => chip.key),
    )
    const fresh = next.filter((chip) => !known.has(chip.key))
    if (fresh.length) {
      setCustomChips((state) => ({
        ...state,
        [field]: [...(state[field] ?? []), ...fresh],
      }))
    }
    setChipChoice((state) => ({
      ...state,
      [field]: new Set(next.map((chip) => chip.key)),
    }))
  }

  function undoRow(row: DialogRow) {
    if (isSetField(row)) {
      setChipChoice((state) => ({
        ...state,
        [row]:
          row === "identifiers" || row === "rating" ? new Set() : undefined,
      }))
      setCustomChips((state) => ({ ...state, [row]: undefined }))
      return
    }
    setScalarChoice((state) => ({ ...state, [row]: undefined }))
    setScalarEdits((state) => ({ ...state, [row]: undefined }))
  }

  function undoAll() {
    setScalarChoice({})
    setScalarEdits({})
    setCustomChips({})
    setChipChoice({ identifiers: new Set(), rating: new Set() })
  }

  function toggleChip(field: SetField, key: string) {
    setChipChoice((state) => {
      const next = new Set(state[field] ?? selectedChips(field))
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...state, [field]: next }
    })
  }

  function selectAllFrom(column: Column) {
    setScalarChoice(
      Object.fromEntries(
        SCALAR_FIELDS.filter(
          (field) => columnFieldValue(column, field) !== undefined,
        ).map((field) => [field, column.provider]),
      ),
    )
    setChipChoice(
      Object.fromEntries(
        SET_FIELDS.map((field) => [
          field,
          new Set(chipsFor(field, column).map((chip) => chip.key)),
        ]),
      ),
    )
  }

  function excludeColumn(column: Column) {
    setScalarChoice((state) =>
      Object.fromEntries(
        Object.entries(state).filter(
          ([, provider]) => provider !== column.provider,
        ),
      ),
    )
    setChipChoice(
      Object.fromEntries(
        setRows.map((field) => {
          const dropped = new Set(
            chipsFor(field, column)
              .map((chip) => chip.key)
              .filter((key) => !currentChipKeys[field].has(key)),
          )
          return [
            field,
            new Set(
              [...selectedChips(field)].filter((key) => !dropped.has(key)),
            ),
          ]
        }),
      ),
    )
  }

  function selectEdition(
    provider: BookMetadataProvider,
    resultId: string,
    editionId: string | null,
  ) {
    if (sources[provider].selectedId === resultId) {
      patchProvider(provider, { editionId })
      resetProposedChips()
      return
    }
    void selectResult(provider, resultId, editionId)
  }

  function toggleEditions(provider: BookMetadataProvider, resultId: string) {
    const state = sources[provider]
    if (state.expandedId === resultId) {
      patchProvider(provider, { expandedId: null })
      return
    }

    patchProvider(provider, { expandedId: resultId })
    if (state.editionsById[resultId] || state.loadingEditionsId === resultId) {
      return
    }

    patchProvider(provider, { loadingEditionsId: resultId })
    void loadEditions(provider, resultId)
      .catch(() => null)
      .then(() => {
        patchProvider(provider, (current) =>
          current.loadingEditionsId === resultId
            ? { loadingEditionsId: null }
            : {},
        )
      })
  }

  function toggleExpanded(field: ScalarField) {
    setExpandedFields((state) => {
      const next = new Set(state)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {loadingStatus ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : !available ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <MetadataUnavailable />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div
            className={cn(
              "flex h-72 w-full shrink-0 flex-col border-b md:h-auto md:w-72 md:border-r md:border-b-0 lg:w-80",
              !paneOpen && "md:hidden",
            )}
          >
            <div className="flex h-11 shrink-0 items-center border-b px-2">
              {availableProviders.length > 1 ? (
                <Tabs
                  value={activeProvider}
                  onValueChange={(value) => {
                    setActiveProvider(value as BookMetadataProvider)
                  }}
                  className="min-w-0 flex-1"
                >
                  <TabsList className="h-8 w-full">
                    {availableProviders.map((provider) => (
                      <TabsTrigger
                        key={provider}
                        value={provider}
                        className="flex-1"
                      >
                        {sources[provider].searching ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <SourceIcon
                            provider={provider}
                            className="size-3.5"
                          />
                        )}
                        {PROVIDER_LABELS[provider]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2 px-2 text-sm font-medium">
                  <SourceIcon provider={activeProvider} className="size-3.5" />
                  {PROVIDER_LABELS[activeProvider]}
                  {sources[activeProvider].searching && (
                    <Spinner className="size-3.5" />
                  )}
                </span>
              )}
            </div>

            <SwipePanels
              value={activeProvider}
              onValueChange={setActiveProvider}
              className="flex-1"
              panels={availableProviders.map((provider) => ({
                value: provider,
                content: (
                  <>
                    {provider === "audnexus" && (
                      <RegionSelect value={region} onChange={setRegion} />
                    )}
                    <div className="scroll-y min-h-0 flex-1">
                      <ResultsList
                        provider={provider}
                        state={sources[provider]}
                        onSelect={(id) => {
                          void selectResult(provider, id)
                        }}
                        onToggleEditions={(id) => {
                          toggleEditions(provider, id)
                        }}
                        onSelectEdition={(resultId, editionId) => {
                          selectEdition(provider, resultId, editionId)
                        }}
                      />
                    </div>
                  </>
                ),
              }))}
            />
          </div>
          {!paneOpen && (
            <CollapsedPane
              providers={availableProviders.map((provider) => ({
                provider,
                state: sources[provider],
              }))}
              onOpen={(provider) => {
                setActiveProvider(provider)
                setPaneOpen(true)
              }}
            />
          )}

          <div className="min-h-0 flex-1 overflow-auto" data-no-swipe>
            <div
              className="grid min-w-fit items-stretch [--provider-min:12rem] [--result-min:15rem] xl:[--provider-min:15rem] xl:[--result-min:18rem]"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <MatrixHeaderCell
                label={t("field")}
                icon={
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    className="-ml-2 hidden shrink-0 md:inline-flex"
                    tooltip={paneOpen ? t("hideResults") : t("showResults")}
                    aria-label={
                      paneOpen ? t.plain("hideResults") : t.plain("showResults")
                    }
                    onClick={() => {
                      setPaneOpen(!paneOpen)
                    }}
                  >
                    {paneOpen ? (
                      <icon.SidebarCollapse className="size-4" />
                    ) : (
                      <icon.SidebarExpand className="size-4" />
                    )}
                  </TooltipButton>
                }
                className="sticky left-0 z-30"
              />
              {columns.map((column) => {
                const { total, picked } = columnSelection(column)
                const all = total > 0 && picked === total
                return (
                  <MatrixHeaderCell
                    key={column.provider}
                    label={PROVIDER_LABELS[column.provider]}
                    icon={<SourceIcon provider={column.provider} />}
                    selected={total > 0 ? all : undefined}
                    selectLabel={t.plain("selectAllFrom", {
                      source: PROVIDER_LABELS[column.provider],
                    })}
                    onSelect={() => {
                      if (all) excludeColumn(column)
                      else selectAllFrom(column)
                    }}
                  />
                )
              })}
              <MatrixHeaderCell
                label={t("result")}
                className={cn("z-30 md:right-0", RESULT_EDGE)}
                action={
                  changeCount > 0 && (
                    <TooltipButton
                      variant="ghost"
                      size="icon-xs"
                      tooltip={t("undoAll")}
                      aria-label={t.plain("undoAll")}
                      onClick={undoAll}
                    >
                      <icon.Undo className="size-3.5" />
                    </TooltipButton>
                  )
                }
              />

              {dialogRows.map((row) => {
                const label = (
                  <div className="bg-background sticky left-0 z-10 border-b pt-3.75 pr-3 pb-3 pl-4 text-sm/5">
                    {row === "rating" ? (
                      <span className="text-sm font-semibold">
                        {t("rating")}
                      </span>
                    ) : (
                      <FieldChip field={row} className="text-sm" />
                    )}
                  </div>
                )

                if (isSetField(row)) {
                  const selected = selectedChips(row)
                  return (
                    <div key={row} className="contents">
                      {label}
                      {columns.map((column) => (
                        <ChipCell
                          key={column.provider}
                          field={row}
                          chips={chipsFor(row, column)}
                          isActive={(key) => selected.has(key)}
                          onToggle={(key) => {
                            toggleChip(row, key)
                          }}
                          loading={column.loading}
                        />
                      ))}
                      <ResultChipCell
                        field={row}
                        entries={resultChips(row)}
                        changed={chipChanged(row)}
                        onToggle={(key) => {
                          toggleChip(row, key)
                        }}
                        onChange={
                          row === "identifiers" || row === "rating"
                            ? undefined
                            : (next) => {
                                setResultChips(row, next)
                              }
                        }
                        onUndo={() => {
                          undoRow(row)
                        }}
                      />
                    </div>
                  )
                }

                const chosen = scalarChoice[row]
                const expanded = expandedFields.has(row)
                const previous = currentFieldValue(book, row)
                const providerCells = columns.map((column) => {
                  const value = formatFieldValue(
                    row,
                    columnFieldValue(column, row),
                  )
                  return (
                    <MatrixValueCell
                      key={column.provider}
                      value={value}
                      loading={column.loading}
                      selected={
                        chosen === column.provider &&
                        scalarEdits[row] === undefined
                      }
                      expanded={expanded}
                      onToggleExpand={() => {
                        toggleExpanded(row)
                      }}
                      onSelect={
                        value !== null
                          ? () => {
                              chooseScalar(
                                row,
                                chosen === column.provider &&
                                  scalarEdits[row] === undefined
                                  ? undefined
                                  : column.provider,
                              )
                            }
                          : undefined
                      }
                    />
                  )
                })

                if (row === "series") {
                  const series = resultSeries()
                  return (
                    <div key={row} className="contents">
                      {label}
                      {providerCells}
                      <ResultSeriesCell
                        series={series.value}
                        origin={series.origin}
                        current={currentSeries}
                        previous={previous}
                        onChange={editSeries}
                        onUndo={() => {
                          undoRow(row)
                        }}
                      />
                    </div>
                  )
                }

                const result = resultScalar(row)

                return (
                  <div key={row} className="contents">
                    {label}
                    {providerCells}
                    <ResultScalarCell
                      key={`${row}:${result.origin.kind === "provider" ? result.origin.provider : result.origin.kind}`}
                      value={result.value}
                      origin={result.origin}
                      previous={previous}
                      editor={scalarEditor(row)}
                      expanded={expanded}
                      onToggleExpand={() => {
                        toggleExpanded(row)
                      }}
                      onEdit={(draft) => {
                        editScalar(row, draft)
                      }}
                      onUndo={() => {
                        undoRow(row)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <DialogFooter className="flex-row items-center border-t px-6 py-3">
        <span className="text-muted-foreground flex-1 text-sm">
          {importError ? (
            <span className="text-destructive">{t("applyFailed")}</span>
          ) : applied && (appliedTo || changeCount === 0) ? (
            <span className="text-foreground inline-flex items-center gap-1.5">
              <icon.Check className="size-3.5" />
              {t("applied")}
            </span>
          ) : (
            t("changeCount", { count: changeCount })
          )}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isImporting}
        >
          {c("actions.close")}
        </Button>
        {step?.onBack && (
          <Button
            type="button"
            variant="outline"
            onClick={step.onBack}
            disabled={isImporting}
          >
            {c("actions.back")}
          </Button>
        )}
        {step && (
          <Button
            type="button"
            variant="outline"
            onClick={step.onSkip}
            disabled={isImporting}
          >
            {t("skip")}
          </Button>
        )}
        <Button
          type="button"
          disabled={
            isImporting ||
            providersBusy ||
            changeCount === 0 ||
            appliedTo !== null
          }
          onClick={() => {
            void handleImport()
          }}
        >
          {isImporting && <Spinner className="size-3.5" />}
          {step && step.index + 1 < step.count
            ? t("applyAndNext")
            : c("actions.apply")}
        </Button>
      </DialogFooter>
    </div>
  )
}

function MatrixHeaderCell({
  label,
  icon: sourceIcon,
  selected,
  selectLabel,
  onSelect,
  action,
  className,
}: {
  label: ReactNode
  icon?: ReactNode
  selected?: boolean | undefined
  selectLabel?: string
  onSelect?: () => void
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "bg-background sticky top-0 z-20 flex h-11 items-center gap-2 border-b px-4",
        className,
      )}
    >
      {selected !== undefined && onSelect && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selectLabel}
          title={selectLabel}
          onClick={onSelect}
          className="cursor-pointer rounded-full"
        >
          <SelectionBullet
            selected={selected}
            className="size-4 border-[1.5px] shadow-none [&_svg]:size-3"
          />
        </button>
      )}
      {sourceIcon}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {label}
      </span>
      {action}
    </div>
  )
}

function RegionSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  const locale = useLocale()
  const items = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" })
    return Object.entries(AUDIBLE_REGION_COUNTRIES).map(
      ([region, country]) => ({
        value: region,
        label: `${flagEmoji(country)} ${region.toUpperCase()}`,
        name: names.of(country) ?? country,
      }),
    )
  }, [locale])

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
        {t("region")}
        <InfoTip>{t("regionTip")}</InfoTip>
      </span>
      <Select
        value={value}
        onValueChange={(next) => {
          onChange(next ?? SEARCH_REGION)
        }}
        items={items}
      >
        <SelectTrigger
          size="sm"
          className="h-7 w-auto"
          aria-label={t.plain("region")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
              <span className="text-muted-foreground">{item.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function CollapsedPane({
  providers,
  onOpen,
}: {
  providers: { provider: BookMetadataProvider; state: ProviderState }[]
  onOpen: (provider: BookMetadataProvider) => void
}) {
  return (
    <div className="hidden w-12 shrink-0 flex-col items-center gap-2 border-r py-2 md:flex">
      {providers.map(({ provider, state }) => {
        const selected = state.results.find(
          ({ result }) => result.id === state.selectedId,
        )?.result
        return (
          <TooltipButton
            key={provider}
            variant="ghost"
            tooltip={
              selected
                ? `${PROVIDER_LABELS[provider]}: ${selected.title}`
                : PROVIDER_LABELS[provider]
            }
            aria-label={PROVIDER_LABELS[provider]}
            className="relative h-auto w-10 p-1"
            onClick={() => {
              onOpen(provider)
            }}
          >
            {selected?.imageUrl ? (
              <img
                src={selected.imageUrl}
                alt=""
                className="h-12 w-8 rounded-xs object-cover shadow-sm"
              />
            ) : (
              <span className="bg-muted h-12 w-8 rounded-xs" />
            )}
            <span className="bg-background absolute -right-0.5 -bottom-0.5 rounded-full p-0.5 shadow-sm">
              {state.searching || state.loadingCandidate ? (
                <Spinner className="size-3" />
              ) : (
                <SourceIcon provider={provider} className="size-3" />
              )}
            </span>
          </TooltipButton>
        )
      })}
    </div>
  )
}

function MatrixValueCell({
  value,
  selected,
  loading,
  expanded,
  onToggleExpand,
  onSelect,
}: {
  value: string | null
  selected: boolean
  loading?: boolean
  expanded: boolean
  onToggleExpand: () => void
  onSelect?: (() => void) | undefined
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  const long = (value?.length ?? 0) > 180

  if (loading) {
    return (
      <div className="border-b p-1.5">
        <div className={CELL_BOX}>
          <Skeleton className="my-0.75 h-3.5 w-3/4" />
        </div>
      </div>
    )
  }

  if (value === null || !onSelect) {
    return (
      <div className="border-b p-1.5">
        <div
          className={cn(
            CELL_BOX,
            "text-muted-foreground/60",
            value === null && "italic",
          )}
        >
          {value ?? t("none")}
        </div>
      </div>
    )
  }

  return (
    <div className="border-b p-1.5">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          CELL_BOX,
          "flex h-full w-full items-start gap-2 text-left transition-colors",
          selected
            ? "border-primary ring-primary/40 bg-primary/5 ring-1"
            : "hover:bg-muted/60",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 break-words",
            !expanded && "line-clamp-3",
          )}
        >
          {value}
        </span>
        {long && (
          <span
            role="button"
            tabIndex={0}
            aria-label={expanded ? t.plain("collapse") : t.plain("expand")}
            className="text-muted-foreground mt-0.75 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation()
                onToggleExpand()
              }
            }}
          >
            {expanded ? (
              <icon.ChevronUp className="size-3.5" />
            ) : (
              <icon.ChevronDown className="size-3.5" />
            )}
          </span>
        )}
      </button>
    </div>
  )
}

function ResultsList({
  provider,
  state,
  onSelect,
  onToggleEditions,
  onSelectEdition,
}: {
  provider: BookMetadataProvider
  state: ProviderState
  onSelect: (id: string) => void
  onToggleEditions: (id: string) => void
  onSelectEdition: (resultId: string, editionId: string | null) => void
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")

  if (state.searching && !state.results.length) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="px-4 py-6 text-center">
        <ProviderSearchError
          code={state.error}
          provider={PROVIDER_LABELS[provider]}
        />
      </div>
    )
  }

  if (!state.results.length) {
    return (
      <p className="text-muted-foreground px-4 py-6 text-center text-sm">
        {t("noResults")}
      </p>
    )
  }

  const hasEditions = provider === "hardcover"

  return (
    <ul>
      {state.results.map(({ result, score, confidence }) => {
        const expanded = state.expandedId === result.id
        const editions = state.editionsById[result.id] ?? []

        return (
          <li key={result.id}>
            <div
              className={cn(
                "flex items-stretch border-b",
                state.selectedId === result.id && "bg-primary/10",
              )}
            >
              {hasEditions && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={t.plain("toggleEditions")}
                  onClick={() => {
                    onToggleEditions(result.id)
                  }}
                  className="hover:bg-muted/60 text-muted-foreground flex w-6 shrink-0 cursor-pointer items-center justify-center"
                >
                  {expanded ? (
                    <icon.ChevronDown className="size-3.5" />
                  ) : (
                    <icon.ChevronRight className="size-3.5" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onSelect(result.id)
                }}
                className={cn(
                  "hover:bg-muted/60 flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-2.5 pr-3 text-left",
                  !hasEditions && "pl-3",
                )}
              >
                {result.imageUrl ? (
                  <img
                    src={result.imageUrl}
                    alt=""
                    className="h-16 w-12 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="bg-muted h-16 w-12 shrink-0 rounded" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-2">
                    <span className="line-clamp-2 flex-1 text-sm font-medium">
                      {result.title}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-medium tabular-nums",
                        CONFIDENCE_STYLES[confidence],
                      )}
                      title={t.plain(`confidence.${confidence}`)}
                    >
                      {Math.round(score * 100)}
                    </span>
                  </span>
                  <span className="text-muted-foreground line-clamp-1 text-xs">
                    {result.authors.join(", ")}
                  </span>
                  {result.narrators.length > 0 && (
                    <span className="text-muted-foreground/80 line-clamp-1 text-xs">
                      {t("narratedBy", {
                        narrators: result.narrators.join(", "),
                      })}
                    </span>
                  )}
                  {(result.releaseYear ?? result.releaseDate) && (
                    <span className="text-muted-foreground/60 text-xs">
                      {result.releaseDate?.slice(0, 10) ?? result.releaseYear}
                    </span>
                  )}
                </span>
              </button>
            </div>

            {hasEditions && expanded && (
              <div className="bg-muted/20 flex flex-col border-b py-1">
                {state.loadingEditionsId === result.id && (
                  <Spinner className="my-1 ml-9 size-3.5" />
                )}

                {state.loadingEditionsId !== result.id && !editions.length && (
                  <span className="text-muted-foreground/60 py-1 pl-9 text-xs italic">
                    {t("noEditions")}
                  </span>
                )}

                {!!editions.length && (
                  <EditionRow
                    active={
                      state.selectedId === result.id && state.editionId === null
                    }
                    onSelect={() => {
                      onSelectEdition(result.id, null)
                    }}
                  >
                    <span className="text-muted-foreground block truncate text-xs italic">
                      {t("anyEdition")}
                    </span>
                  </EditionRow>
                )}

                {editions.map((edition) => {
                  const audio =
                    !!edition.audioSeconds ||
                    edition.format.toLowerCase().includes("audio")
                  const subtitle = [
                    edition.language,
                    edition.releaseDate?.slice(0, 4),
                  ]
                    .filter(Boolean)
                    .join(" · ")

                  return (
                    <EditionRow
                      key={edition.id}
                      active={
                        state.selectedId === result.id &&
                        state.editionId === edition.id
                      }
                      onSelect={() => {
                        onSelectEdition(result.id, edition.id)
                      }}
                    >
                      <span className="flex items-center gap-2.5">
                        {edition.imageUrl ? (
                          <img
                            src={edition.imageUrl}
                            alt=""
                            className="h-12 w-8 shrink-0 rounded-sm object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="bg-muted h-12 w-8 shrink-0 rounded-sm" />
                        )}
                        {audio ? (
                          <icon.Headphones className="text-muted-foreground size-3.5 shrink-0" />
                        ) : (
                          <icon.Book className="text-muted-foreground size-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs first-letter:uppercase">
                            {edition.editionInfo || edition.format}
                          </span>
                          {!!subtitle && (
                            <span className="text-muted-foreground block truncate text-[0.6875rem]">
                              {subtitle}
                            </span>
                          )}
                        </span>
                      </span>
                    </EditionRow>
                  )
                })}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function EditionRow({
  active,
  onSelect,
  children,
}: {
  active: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "w-full cursor-pointer py-1 pr-3 pl-9 text-left transition-colors",
        active ? "bg-primary/15" : "hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  )
}

function ChipCell({
  field,
  chips,
  isActive,
  onToggle,
  loading,
  disabled,
}: {
  field: SetField
  chips: Chip[]
  isActive: (key: string) => boolean
  onToggle?: ((key: string) => void) | undefined
  loading?: boolean
  disabled?: boolean
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  const empty = (
    <span className="text-muted-foreground/60 italic">{t("none")}</span>
  )
  const skeleton = (
    <>
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-6 w-14 rounded-full" />
    </>
  )

  const pill = (chip: Chip) => {
    const active = isActive(chip.key)
    return (
      <button
        key={chip.key}
        type="button"
        aria-pressed={active}
        disabled={disabled || !onToggle}
        onClick={() => onToggle?.(chip.key)}
        className={cn(
          "h-6 max-w-full truncate rounded-full border px-2.5 text-left text-xs transition-colors",
          active
            ? "border-primary bg-primary/10 text-foreground"
            : "border-input text-muted-foreground",
          !disabled && onToggle && "hover:bg-muted/60 cursor-pointer",
          disabled && "opacity-40",
        )}
      >
        {chip.rating ? (
          <span className="flex items-center gap-1.5" title={chip.label}>
            <RatingValue
              rating={chip.rating.value}
              logo={chip.rating.logo}
              color={chip.rating.color}
            />
            {!chip.rating.logo && chip.label}
          </span>
        ) : (
          chip.label
        )}
      </button>
    )
  }

  if (field !== "identifiers") {
    return (
      <div className="border-b p-1.5">
        <div className={CELL_BOX}>
          <div className="-my-0.5 flex flex-wrap gap-1.5">
            {loading ? skeleton : chips.length ? chips.map(pill) : empty}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border-b p-1.5">
      <div className={cn(CELL_BOX, "flex flex-col gap-2")}>
        {loading && <div className="-my-0.5 flex gap-1.5">{skeleton}</div>}
        {!loading && !chips.length && empty}
        {!loading &&
          IDENTIFIER_SCOPES.map((scope) => {
            const group = chips.filter((chip) => chip.scope === scope)
            if (!group.length) return null
            return (
              <div key={scope} className="flex flex-col items-start gap-1">
                <span className="text-muted-foreground text-[0.6875rem] font-semibold">
                  {t(`scopes.${scope}`)}
                </span>
                {group.map(pill)}
              </div>
            )
          })}
      </div>
    </div>
  )
}

function OriginMark({
  origin,
  className,
}: {
  origin: Origin
  className?: string
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  if (origin.kind === "provider") {
    return (
      <span
        title={t.plain("from", { source: PROVIDER_LABELS[origin.provider] })}
        className={cn("inline-flex shrink-0", className)}
      >
        <SourceIcon provider={origin.provider} className="size-3.5" />
      </span>
    )
  }
  if (origin.kind === "edited") {
    return (
      <span
        title={t.plain("edited")}
        className={cn("text-primary inline-flex shrink-0", className)}
      >
        <icon.Pencil className="size-3.5" />
      </span>
    )
  }
  return null
}

function stopEscape(event: KeyboardEvent<HTMLElement>, onEscape: () => void) {
  if (event.key !== "Escape") return false
  event.preventDefault()
  event.stopPropagation()
  onEscape()
  return true
}

function ResultScalarCell({
  value,
  origin,
  previous,
  editor,
  expanded,
  onToggleExpand,
  onEdit,
  onUndo,
}: {
  value: string | null
  origin: Origin
  previous: string | null
  editor: ScalarEditor
  expanded: boolean
  onToggleExpand: () => void
  onEdit: (draft: string) => void
  onUndo: () => void
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  const locale = useLocale()
  const [draft, setDraft] = useState<string | null>(null)
  const color = originColor(origin)
  const long = (value?.length ?? 0) > 180
  const language =
    editor === "language" && value ? describeLanguage(value, locale) : null
  const draftValid =
    editor !== "language" ||
    !draft?.trim() ||
    describeLanguage(draft, locale).maximized !== null

  const commit = () => {
    if (draft === null) return
    if (draftValid) onEdit(draft)
    setDraft(null)
  }
  const cancel = () => {
    setDraft(null)
  }

  return (
    <div
      className={cn(
        "bg-background z-10 border-b p-1.5 md:sticky md:right-0",
        RESULT_EDGE,
      )}
    >
      <div
        className={cn(
          "flex h-full items-start gap-1 rounded-lg border p-1 text-sm transition-colors",
          color ? ORIGIN_TINT : "border-transparent",
        )}
        style={originStyle(color)}
      >
        <OriginMark origin={origin} className="mt-1.5 ml-1" />
        {draft !== null && editor === "textarea" ? (
          <Textarea
            autoFocus
            value={draft}
            rows={5}
            onChange={(event) => {
              setDraft(event.target.value)
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (stopEscape(event, cancel)) return
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                commit()
              }
            }}
            className={cn(EDIT_BOX, "max-h-80 min-h-0 flex-1")}
          />
        ) : draft !== null ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              autoFocus
              type={editor === "date" ? "date" : "text"}
              value={draft}
              aria-invalid={!draftValid}
              placeholder={
                editor === "language" ? "e.g. en, pt-BR, zh-Hans" : undefined
              }
              onChange={(event) => {
                setDraft(event.target.value)
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (stopEscape(event, cancel)) return
                if (event.key === "Enter") {
                  event.preventDefault()
                  if (draftValid) commit()
                }
              }}
              className={cn(EDIT_BOX, "h-auto")}
            />
            {editor === "language" && (
              <LanguagePreview language={draft} className="px-2" />
            )}
          </div>
        ) : (
          <button
            type="button"
            title={t.plain("editValue")}
            onClick={() => {
              setDraft(value ?? "")
            }}
            className={cn(
              EDIT_BOX,
              "hover:border-input hover:bg-input/20 dark:hover:bg-input/30 min-w-0 flex-1 cursor-text! border-transparent bg-transparent text-left dark:bg-transparent",
            )}
          >
            <span
              className={cn(
                "block break-words",
                !expanded && "line-clamp-3",
                value === null && "text-muted-foreground/60 italic",
              )}
            >
              {language?.displayName ? (
                <>
                  {language.displayName}
                  <span className="text-muted-foreground"> · {value}</span>
                </>
              ) : (
                (value ?? t("none"))
              )}
            </span>
          </button>
        )}
        {long && draft === null && (
          <button
            type="button"
            aria-label={expanded ? t.plain("collapse") : t.plain("expand")}
            className="text-muted-foreground mt-1.5 shrink-0"
            onClick={onToggleExpand}
          >
            {expanded ? (
              <icon.ChevronUp className="size-3.5" />
            ) : (
              <icon.ChevronDown className="size-3.5" />
            )}
          </button>
        )}
        {origin.kind !== "current" && draft === null && (
          <UndoButton previous={previous} onUndo={onUndo} />
        )}
      </div>
    </div>
  )
}

function UndoButton({
  previous,
  onUndo,
  className,
}: {
  previous?: string | null | undefined
  onUndo: () => void
  className?: string
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  return (
    <TooltipButton
      variant="ghost"
      size="icon-xs"
      className={cn("mt-0.5 shrink-0", className)}
      tooltip={
        previous === undefined
          ? t("undo")
          : previous === null
            ? t("wasEmpty")
            : t("was", {
                value:
                  previous.length > 80 ? `${previous.slice(0, 80)}…` : previous,
              })
      }
      aria-label={t.plain("undo")}
      onClick={onUndo}
    >
      <icon.Undo className="size-3.5" />
    </TooltipButton>
  )
}

function ResultChipsFrame({
  changed,
  previous,
  onUndo,
  children,
}: {
  changed: boolean
  previous?: string | null | undefined
  onUndo: () => void
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "bg-background z-10 border-b p-1.5 md:sticky md:right-0",
        RESULT_EDGE,
      )}
    >
      <div className="flex items-start gap-2 py-2 pr-1 pl-3.5">
        <div className="min-w-0 flex-1">{children}</div>
        {changed && (
          <UndoButton previous={previous} onUndo={onUndo} className="mt-0" />
        )}
      </div>
    </div>
  )
}

function ResultSeriesCell({
  series,
  origin,
  current,
  previous,
  onChange,
  onUndo,
}: {
  series: SeriesValue
  origin: Origin
  current: SeriesValue
  previous: string | null
  onChange: (next: SeriesValue) => void
  onUndo: () => void
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  const tActions = useTranslation("BookActions")
  const changed = origin.kind !== "current"
  const unchanged = new Set(current.map(seriesKey))
  const chipOrigin = (entry: SeriesValue[number]) =>
    unchanged.has(seriesKey(entry)) ? CURRENT_ORIGIN : origin
  const values = series.map((entry) => ({
    name: entry.name,
    position: entry.position ?? null,
  }))

  const setPosition = (name: string, position: string) => {
    onChange(
      values.map((entry) =>
        entry.name === name
          ? { ...entry, position: position === "" ? null : Number(position) }
          : entry,
      ),
    )
  }

  return (
    <ResultChipsFrame changed={changed} previous={previous} onUndo={onUndo}>
      <RelationChipField
        values={values}
        onChange={onChange}
        source="series"
        entryId={(entry) => entry.name}
        itemId={(item) => item.name}
        toChip={(entry) => ({
          uuid: entry.name,
          name: entry.name,
          position: entry.position,
        })}
        entryFromPick={(item) => ({ name: item.name, position: null })}
        createEntry={(name, existing) =>
          existing.some((entry) => entry.name === name)
            ? null
            : { name, position: null }
        }
        searchPlaceholder={tActions.plain("search")}
        decorate={(chip) => {
          const chipFrom = chipOrigin(chip)
          const color = originColor(chipFrom)
          return {
            className: cn(color && ORIGIN_TINT),
            style: originStyle(color),
            prefix: <OriginMark origin={chipFrom} className="[&_svg]:size-3" />,
          }
        }}
        renderBadgeExtra={(chip) => (
          <span className="flex items-center gap-0.5">
            <span aria-hidden>#</span>
            <input
              type="number"
              step="any"
              value={chip.position ?? ""}
              aria-label={t.plain("seriesPosition")}
              onChange={(event) => {
                setPosition(chip.name, event.target.value.trim())
              }}
              className="w-8 [appearance:textfield] border-b border-dashed bg-transparent text-center outline-none focus-visible:border-solid [&::-webkit-inner-spin-button]:appearance-none"
            />
          </span>
        )}
      >
        {!values.length && (
          <span className="text-muted-foreground/60 py-0.5 text-sm italic">
            {t("none")}
          </span>
        )}
      </RelationChipField>
      {changed && (
        <p className="text-muted-foreground mt-1.5 text-xs">
          {previous === null ? t("wasEmpty") : t("was", { value: previous })}
        </p>
      )}
    </ResultChipsFrame>
  )
}

function ResultChipCell({
  field,
  entries,
  changed,
  onToggle,
  onChange,
  onUndo,
}: {
  field: SetField
  entries: ResultChip[]
  changed: boolean
  onToggle: (key: string) => void
  onChange?: ((next: Chip[]) => void) | undefined
  onUndo: () => void
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  const removed = entries.filter((entry) => entry.state === "removed")
  const kept = entries.filter((entry) => entry.state !== "removed")

  const removedChips = removed.map(({ chip }) => (
    <button
      key={chip.key}
      type="button"
      title={t.plain("restore")}
      onClick={() => {
        onToggle(chip.key)
      }}
      className="border-input text-muted-foreground/70 hover:bg-muted/60 inline-flex h-6 max-w-full items-center rounded-full border border-dashed px-2.5 text-xs line-through"
    >
      <span className="truncate">{chip.label}</span>
    </button>
  ))

  return (
    <ResultChipsFrame changed={changed} onUndo={onUndo}>
      {onChange && field !== "identifiers" && field !== "rating" ? (
        <ResultRelationEditor field={field} entries={kept} onChange={onChange}>
          {removedChips}
        </ResultRelationEditor>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {!entries.length && (
            <span className="text-muted-foreground/60 py-0.5 text-sm italic">
              {t("none")}
            </span>
          )}
          {kept.map(({ chip, origin }) => {
            const color = originColor(origin)
            return (
              <span
                key={chip.key}
                title={chip.label}
                className={cn(
                  "inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2.5 text-xs",
                  color ? ORIGIN_TINT : "border-input",
                )}
                style={originStyle(color)}
              >
                {chip.rating ? (
                  <RatingValue
                    rating={chip.rating.value}
                    logo={chip.rating.logo}
                    color={chip.rating.color}
                  />
                ) : (
                  <>
                    <OriginMark origin={origin} className="[&_svg]:size-3" />
                    <span className="truncate">{chip.label}</span>
                  </>
                )}
              </span>
            )
          })}
          {removedChips}
        </div>
      )}
    </ResultChipsFrame>
  )
}

type ChipEntry = { name: string; role: string }

function ResultRelationEditor({
  field,
  entries,
  onChange,
  className,
  children,
}: {
  field: ImportEachField
  entries: ResultChip[]
  onChange: (next: Chip[]) => void
  className?: string
  children?: ReactNode
}) {
  const t = useTranslation("BookDetailsPage")
  const tActions = useTranslation("BookActions")
  const creators = field === "creators"

  const toEntry = (chip: Chip): ChipEntry =>
    typeof chip.value === "object"
      ? chip.value
      : { name: chip.label, role: DEFAULT_CREATOR_ROLE }
  const toChip = (entry: ChipEntry): Chip =>
    creators ? creatorChip(entry) : nameChip(entry.name)

  const origins = new Map(
    entries.map((entry) => [toEntry(entry.chip).name, entry.origin]),
  )
  const values = entries.map((entry) => toEntry(entry.chip))

  return (
    <RelationChipField
      values={values}
      onChange={(next) => {
        onChange(next.map(toChip))
      }}
      source={field}
      entryId={(entry) => entry.name}
      itemId={(item) => item.name}
      toChip={(entry) => ({
        uuid: entry.name,
        name: entry.name,
        role: entry.role,
      })}
      entryFromPick={(item) => ({
        name: item.name,
        role: DEFAULT_CREATOR_ROLE,
      })}
      createEntry={(name) => ({ name, role: DEFAULT_CREATOR_ROLE })}
      searchPlaceholder={
        field === "authors"
          ? t.plain("addAuthor")
          : field === "narrators"
            ? t.plain("addNarrator")
            : creators
              ? t.plain("addContributor")
              : tActions.plain("search")
      }
      decorate={(chip) => {
        const origin = origins.get(chip.name) ?? EDITED_ORIGIN
        const color = originColor(origin)
        return {
          className: cn(color && ORIGIN_TINT),
          style: originStyle(color),
          prefix: <OriginMark origin={origin} className="[&_svg]:size-3" />,
        }
      }}
      renderBadgeExtra={
        creators
          ? (chip) => (
              <ContributorRolePicker
                value={chip.role}
                onChange={(role) => {
                  onChange(
                    values.map((entry) =>
                      toChip(
                        entry.name === chip.name ? { ...entry, role } : entry,
                      ),
                    ),
                  )
                }}
              />
            )
          : undefined
      }
      className={className}
    >
      {children}
    </RelationChipField>
  )
}
