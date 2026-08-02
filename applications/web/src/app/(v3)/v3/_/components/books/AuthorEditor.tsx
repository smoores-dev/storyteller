import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { type RelationSource } from "@/app/(v3)/v3/_/hooks/use-relation-items"

import { RelationFormField } from "./RelationFormField"

export function AuthorEditor({ className }: { className?: string }) {
  const t = useTranslation()
  const c = useCommon()

  return (
    <RelationFormField
      name="authors"
      source="authors"
      entryId={(name) => name}
      itemId={(item) => item.name}
      toChip={(name) => ({ uuid: name, name })}
      entryFromPick={(item) => item.name}
      createEntry={(name) => name}
      label={c.plain("fields.label.authors")}
      searchPlaceholder={t.plain("BookDetailsPage.addAuthor")}
      className={className}
    />
  )
}

export function NarratorEditor({ className }: { className?: string }) {
  const t = useTranslation()

  return (
    <RelationFormField
      name="narrators"
      source="narrators"
      entryId={(name) => name}
      itemId={(item) => item.name}
      toChip={(name) => ({ uuid: name, name })}
      entryFromPick={(item) => item.name}
      createEntry={(name) => name}
      label={t.plain("Labels.narrators")}
      searchPlaceholder={t.plain("BookDetailsPage.addNarrator")}
      className={className}
    />
  )
}
