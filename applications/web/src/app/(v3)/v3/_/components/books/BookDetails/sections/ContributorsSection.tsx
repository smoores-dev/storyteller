"use client"

import { useBookForm } from "@v3/_/components/books/BookDetails/BookFormProvider"
import { RelationFormField } from "@v3/_/components/books/RelationFormField"
import { RoleMenuItems, roleLabel } from "@v3/_/components/books/RolePicker"
import { Badge } from "@v3/_/components/ui/badge"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { DEFAULT_CREATOR_ROLE } from "@/components/books/edit/marcRelators"
import * as icon from "@/icons"

import { CollapsibleSection } from "./CollapsibleSection"

export function ContributorsSection({ className }: { className?: string }) {
  const { book, isEditing } = useBookForm()
  const tLabels = useTranslation("Labels")

  const nonAuthorNarratorCreators = book.creators.filter(
    (c) => c.role !== "aut" && c.role !== "nrt",
  )

  const isVisible = isEditing || nonAuthorNarratorCreators.length > 0
  if (!isVisible) return null

  return (
    <CollapsibleSection
      title={tLabels("otherContributors")}
      sectionKey="contributors"
      className={className}
    >
      {isEditing ? (
        <ContributorsEditor />
      ) : (
        <div className="flex flex-wrap gap-2">
          {nonAuthorNarratorCreators.map((creator) => (
            <Badge key={creator.uuid} variant="outline">
              {creator.name}
              {creator.role && (
                <span className="text-muted-foreground ml-1">
                  ({roleLabel(creator.role)})
                </span>
              )}
            </Badge>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}

function ContributorsEditor() {
  const { form } = useBookForm()
  const t = useTranslation("BookDetailsPage")

  const setRole = (name: string, role: string) => {
    form.setValue(
      "creators",
      form
        .getValues("creators")
        .map((entry) => (entry.name === name ? { ...entry, role } : entry)),
      { shouldDirty: true },
    )
  }

  return (
    <RelationFormField
      name="creators"
      source="creators"
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
      searchPlaceholder={t.plain("addContributor")}
      renderBadgeExtra={(chip) => (
        <ContributorRolePicker
          value={chip.role}
          onChange={(role) => {
            setRole(chip.name, role)
          }}
        />
      )}
    />
  )
}

function ContributorRolePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (role: string) => void
}) {
  const c = useCommon()

  return (
    <FilterableMenu>
      <FilterableMenuTrigger
        render={
          <button
            type="button"
            aria-label={c.plain("actions.edit")}
            className="text-muted-foreground hover:text-foreground -mr-0.5 ml-0.5 flex items-center gap-0.5 rounded-full text-[0.65rem]"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {roleLabel(value) || c.plain("actions.select")}
            <icon.ChevronDown className="size-2.5" />
          </button>
        }
      />
      <FilterableMenuContent align="start" className="max-h-110">
        <RoleMenuItems value={value} onSelect={onChange} />
      </FilterableMenuContent>
    </FilterableMenu>
  )
}
