"use client"

import {
  FilterableMenuGroup,
  FilterableMenuItem,
  FilterableMenuLabel,
} from "@v3/_/components/ui/filterable-menu"
import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  type MarcRelator,
  commonCreatorRelators,
  commonMarcRelators,
  creatorRelators,
  marcRelators,
} from "@/components/books/edit/marcRelators"
import * as icon from "@/icons"

const ROLE_LABELS = new Map<string, string>(
  marcRelators.map((r) => [r.value as string, r.label]),
)

export function roleLabel(role: string | null | undefined): string {
  if (!role) return ""
  return ROLE_LABELS.get(role) ?? role
}

function roleGroups(includeAuthorNarrator: boolean): {
  common: MarcRelator[]
  rest: MarcRelator[]
} {
  const common = includeAuthorNarrator
    ? commonMarcRelators
    : commonCreatorRelators
  const all: MarcRelator[] = includeAuthorNarrator
    ? [...marcRelators]
    : creatorRelators

  const pinned = new Set(common.map((r) => r.value))
  return { common, rest: all.filter((r) => !pinned.has(r.value)) }
}

export function RoleMenuItems({
  value,
  onSelect,
  includeAuthorNarrator = false,
  closeOnClick,
}: {
  value: string | null | undefined
  onSelect: (role: string) => void
  includeAuthorNarrator?: boolean
  closeOnClick?: boolean
}) {
  const tLabels = useTranslation("Labels")
  const { common, rest } = roleGroups(includeAuthorNarrator)

  const row = (relator: MarcRelator) => (
    <FilterableMenuItem
      key={relator.value}
      textValue={relator.label}
      keywords={relator.value}
      closeOnClick={closeOnClick}
      onSelect={() => {
        onSelect(relator.value)
      }}
    >
      {relator.label}
      {value === relator.value && <icon.Check className="ml-auto" />}
    </FilterableMenuItem>
  )

  return (
    <>
      <FilterableMenuGroup>
        <FilterableMenuLabel>{tLabels("commonRoles")}</FilterableMenuLabel>
        {common.map(row)}
      </FilterableMenuGroup>

      <FilterableMenuGroup>
        <FilterableMenuLabel>{tLabels("allRoles")}</FilterableMenuLabel>
        {rest.map(row)}
      </FilterableMenuGroup>
    </>
  )
}
