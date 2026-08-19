"use client"

import { CollectionEditor } from "@v3/_/components/books/CollectionEditor"
import { RelationDisplay } from "@v3/_/components/books/RelationDisplay"
import { TagEditor } from "@v3/_/components/books/TagEditor"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { useBookForm } from "@/app/(v3)/v3/_/components/books/BookDetails/BookFormProvider"

import { CollapsibleSection } from "./CollapsibleSection"

export function TagsSection() {
  const { book, isFieldActive, setEditingField, canEdit } = useBookForm()
  const c = useCommon()
  const t = useTranslation("BookDetailsPage.tags")

  return (
    <CollapsibleSection title={c("fields.label.tags")} sectionKey="tags">
      {isFieldActive("tags") ? (
        <TagEditor />
      ) : (
        <RelationDisplay
          items={book.tags.map((tag) => ({ uuid: tag.uuid, name: tag.name }))}
          source="tags"
          emptyText={t("notInAnyTags")}
          canEdit={canEdit}
          onEdit={() => {
            setEditingField("tags")
          }}
        />
      )}
    </CollapsibleSection>
  )
}

export function CollectionsSection() {
  const { book, isFieldActive, setEditingField, canEdit } = useBookForm()
  const c = useCommon()
  const t = useTranslation("BookDetailsPage.collections")

  return (
    <CollapsibleSection
      title={c("fields.label.collections")}
      sectionKey="collections"
    >
      {isFieldActive("collections") ? (
        <CollectionEditor />
      ) : (
        <RelationDisplay
          items={book.collections.map((collection) => ({
            uuid: collection.uuid,
            name: collection.name,
            url: `/collections?item=${collection.uuid}`,
            icon: collection.icon,
            color: collection.color,
          }))}
          source="collections"
          badgeVariant="secondary"
          emptyText={t("notInAnyCollections")}
          canEdit={canEdit}
          onEdit={() => {
            setEditingField("collections")
          }}
        />
      )}
    </CollapsibleSection>
  )
}
