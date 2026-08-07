"use client"

import { type ReactNode, useEffect, useMemo, useRef } from "react"

import { VirtualizedFilterableMenuItems } from "@v3/_/components/ui/filterable-menu"

import { RelationGlyph } from "@/app/(v3)/v3/_/components/books/RelationChipEditor"
import {
  type RelationItem,
  type RelationSource,
  useRelationItems,
} from "@/app/(v3)/v3/_/hooks/use-relation-items"
import { marcRelators } from "@/components/books/edit/marcRelators"
import { type Field } from "@/fields"
import * as icon from "@/icons"

export type RelationRowState = "primary" | "secondary" | "none"

const ROLE_LABELS = new Map(marcRelators.map((r) => [r.value, r.label]))

// role rows come from json aggregation, so nulls can sneak in despite the type
function roleSuffix(
  roles: readonly (string | null)[] | undefined,
): string | null {
  if (!roles?.length) return null
  const labels = roles
    .filter((r): r is string => r != null)
    .map((r) => ROLE_LABELS.get(r as never) ?? r)
  return labels.length ? labels.join(", ") : null
}

function defaultTrailing(state: RelationRowState): ReactNode {
  if (state === "primary")
    return <icon.Check className="text-primary h-4 w-4" />
  if (state === "secondary")
    return <icon.Remove className="text-muted-foreground h-4 w-4" />
  return null
}

export function RelationSelectList({
  source,
  field,
  items: itemsProp,
  loading: loadingProp,
  enabled,
  stateOf,
  onSelect,
  renderTrailing = defaultTrailing,
  filter,
  create,
  footer,
  emptyText,
}: {
  source?: RelationSource
  // the registry field backing a "distinct" source
  field?: Field
  items?: RelationItem[]
  loading?: boolean
  enabled: boolean
  stateOf: (item: RelationItem) => RelationRowState
  onSelect: (item: RelationItem) => void
  renderTrailing?: (state: RelationRowState) => ReactNode
  filter?: (item: RelationItem) => boolean
  create?: {
    label: (query: string) => string
    onCreate: (query: string) => void
    allowEmptyQuery?: boolean
  }
  footer?: ReactNode
  emptyText?: string
}) {
  const fetched = useRelationItems(source, enabled && !itemsProp, field)
  console.log("fetched", fetched)
  const rawItems = itemsProp ?? fetched.items
  const loading = loadingProp ?? (itemsProp ? false : fetched.loading)

  const items = useMemo(
    () => (filter ? rawItems.filter(filter) : rawItems),
    [rawItems, filter],
  )

  const snapshotRef = useRef<Set<string> | null>(null)
  if (enabled && items.length > 0 && snapshotRef.current === null) {
    snapshotRef.current = new Set(
      items.filter((i) => stateOf(i) !== "none").map((i) => i.uuid),
    )
  }
  useEffect(() => {
    if (!enabled) snapshotRef.current = null
  }, [enabled])

  const ordered = useMemo(() => {
    const snap = snapshotRef.current
    if (!snap || snap.size === 0) return items
    return [...items].sort(
      (a, b) => (snap.has(a.uuid) ? 0 : 1) - (snap.has(b.uuid) ? 0 : 1),
    )
  }, [items])

  return (
    <VirtualizedFilterableMenuItems
      items={ordered}
      getKey={(i) => i.uuid}
      getText={(i) => i.name}
      onSelect={(item) => {
        onSelect(item)
      }}
      loading={loading}
      emptyText={emptyText}
      create={create}
      footer={footer}
      renderRow={(item) => {
        const roles = roleSuffix(item.roles)
        return (
          <>
            <RelationGlyph item={item} />
            <span className="min-w-0 flex-1 truncate">
              {item.name}
              {roles && (
                <span className="text-muted-foreground/80 ml-1.5 text-xs">
                  {roles}
                </span>
              )}
            </span>
            <span className="flex w-4 shrink-0 items-center justify-center">
              {renderTrailing(stateOf(item))}
            </span>
          </>
        )
      }}
    />
  )
}
