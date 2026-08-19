import { useLocale } from "next-intl"
import { useMemo } from "react"

import { type Role } from "@/components/books/edit/marcRelators"
import { type FacetSource, type Field } from "@/fields"
import {
  useListAuthorsQuery,
  useListCollectionsQuery,
  useListCreatorsQuery,
  useListDistinctFieldValuesQuery,
  useListIdentifierTypesQuery,
  useListNarratorsQuery,
  useListSeriesQuery,
  useListStatusesQuery,
  useListTagsQuery,
  useListTranslatorsQuery,
} from "@/store/api"
import { type UUID } from "@/uuid"

export type RelationSource = FacetSource

export type RelationItem = {
  uuid: string
  name: string
  icon?: string | null
  color?: string | null
  roles?: readonly Role[]
}

type RelationRow = {
  uuid: UUID
  name: string
  icon?: string | null
  color?: string | null
  roles?: readonly Role[]
}

function distinctValueName(
  field: Field | undefined,
  value: string,
  locale: string,
): string {
  if (field !== "language") return value
  try {
    return (
      new Intl.DisplayNames([locale], {
        type: "language",
        languageDisplay: "dialect",
      }).of(value) ?? value
    )
  } catch {
    return value
  }
}

export function useRelationItems(
  source: RelationSource | undefined,
  enabled: boolean,
  field?: Field,
): { items: RelationItem[]; loading: boolean } {
  const locale = useLocale()

  const on = (s: RelationSource) => enabled && source === s

  const tags = useListTagsQuery(undefined, { skip: !on("tags") })
  const collections = useListCollectionsQuery(undefined, {
    skip: !on("collections"),
  })
  const series = useListSeriesQuery(undefined, { skip: !on("series") })
  const statuses = useListStatusesQuery(undefined, { skip: !on("statuses") })
  const authors = useListAuthorsQuery(undefined, { skip: !on("authors") })
  const narrators = useListNarratorsQuery(undefined, { skip: !on("narrators") })
  const translators = useListTranslatorsQuery(undefined, {
    skip: !on("translators"),
  })
  const creators = useListCreatorsQuery(undefined, { skip: !on("creators") })
  const identifiers = useListIdentifierTypesQuery(undefined, {
    skip: !on("identifiers"),
  })
  const distinct = useListDistinctFieldValuesQuery(
    { field: field ?? "" },
    { skip: !on("distinct") || !field },
  )

  const active = (() => {
    switch (source) {
      case "tags":
        return tags
      case "collections":
        return collections
      case "series":
        return series
      case "statuses":
        return statuses
      case "authors":
        return authors
      case "narrators":
        return narrators
      case "translators":
        return translators
      case "creators":
        return creators
      case "identifiers":
        return identifiers
      case "distinct":
        return distinct
      default:
        return undefined
    }
  })()

  const data = active?.data
  const items = useMemo<RelationItem[]>(() => {
    if (source === "distinct") {
      const values = (data ?? []) as readonly string[]
      return values
        .map((value) => ({
          uuid: value,
          name: distinctValueName(field, value, locale),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    const rows = (data ?? []) as readonly RelationRow[]
    const list = rows
    return list
      .map((d) => ({
        uuid: d.uuid,
        name: d.name,
        icon: d.icon,
        color: d.color,
        ...(source === "creators" && d.roles ? { roles: d.roles } : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data, source, field, locale])

  return { items, loading: !!active?.isLoading }
}
