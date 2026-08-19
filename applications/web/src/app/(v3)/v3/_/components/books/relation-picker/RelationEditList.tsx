"use client"

import { useMemo } from "react"

import {
  type RelationItem,
  type RelationSource,
} from "@/app/(v3)/v3/_/hooks/use-relation-items"
import { useRelationEditActions } from "@/app/(v3)/v3/_/hooks/use-relation-mutations"
import { type BookWithRelations } from "@/database/books"
import { type UUID } from "@/uuid"

import { type RelationRowState, RelationSelectList } from "./RelationSelectList"

export type MembershipState = "all" | "some" | "none"

export type RelationMembership = Map<string, number>

function bookRelationUuids(
  book: BookWithRelations,
  source: RelationSource,
): UUID[] {
  switch (source) {
    case "tags":
      return book.tags.map((t) => t.uuid)
    case "collections":
      return book.collections.map((c) => c.uuid)
    case "series":
      return book.series.map((s) => s.uuid)
    case "statuses":
      return book.status ? [book.status.uuid] : []
    case "authors":
      return book.authors.map((c) => c.uuid)
    case "narrators":
      return book.narrators.map((c) => c.uuid)
    case "translators":
      return book.creators.filter((c) => c.role === "trl").map((c) => c.uuid)
    case "creators":
      return book.creators.filter((c) => c.role !== "trl").map((c) => c.uuid)

    case "distinct":
      return []
    case "identifiers":
      return []
    default: {
      const _exhaustive: never = source
      return []
    }
  }
}

export function membershipFromBooks(
  books: BookWithRelations[],
  source: RelationSource,
): RelationMembership {
  const m: RelationMembership = new Map()
  for (const book of books) {
    for (const uuid of new Set(bookRelationUuids(book, source))) {
      m.set(uuid, (m.get(uuid) ?? 0) + 1)
    }
  }
  return m
}

function membershipRowState(state: MembershipState): RelationRowState {
  if (state === "all") return "primary"
  if (state === "some") return "secondary"
  return "none"
}

export function RelationEditList({
  source,
  bookUuids,
  membership,
  enabled,
  showApplied = true,
  onCreate,
  createLabel,
  onSelectOverride,
}: {
  source: RelationSource
  bookUuids: UUID[]
  membership: RelationMembership
  enabled: boolean
  showApplied?: boolean
  onCreate?: (name: string) => void
  createLabel?: (search: string) => string
  onSelectOverride?: (item: RelationItem, state: MembershipState) => void
}) {
  const actions = useRelationEditActions(source)

  const stateOf = useMemo(() => {
    const total = bookUuids.length
    return (uuid: string): MembershipState => {
      const n = membership.get(uuid) ?? 0
      if (n === 0) return "none"
      if (total > 0 && n === total) return "all"
      return "some"
    }
  }, [membership, bookUuids.length])

  const handleClick = (item: RelationItem, state: MembershipState) => {
    if (onSelectOverride) {
      onSelectOverride(item, state)
      return
    }
    if (actions.singleSelect) {
      actions.add(bookUuids, item)
      return
    }
    if (state === "all") {
      actions.remove(bookUuids, item.uuid as UUID)
    } else {
      actions.add(bookUuids, item)
    }
  }

  const create =
    onCreate || actions.createAndAdd
      ? {
          label: (s: string) => createLabel?.(s) ?? `Create "${s}"`,
          onCreate: (s: string) => {
            if (onCreate) onCreate(s)
            else actions.createAndAdd?.(bookUuids, s)
          },
          allowEmptyQuery: !!onCreate,
        }
      : undefined

  return (
    <RelationSelectList
      source={source}
      enabled={enabled}
      stateOf={(item) => membershipRowState(stateOf(item.uuid))}
      onSelect={(item) => {
        handleClick(item, stateOf(item.uuid))
      }}
      filter={showApplied ? undefined : (i) => stateOf(i.uuid) === "none"}
      create={create}
    />
  )
}
