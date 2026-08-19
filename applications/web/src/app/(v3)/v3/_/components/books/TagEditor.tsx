import { useTranslation } from "@v3/_/hooks/use-translation"

import { RelationFormField } from "./RelationFormField"

export function TagEditor({ className }: { className?: string }) {
  const tActions = useTranslation("BookActions")

  return (
    <RelationFormField
      name="tags"
      source="tags"
      entryId={(name) => name}
      itemId={(item) => item.name}
      toChip={(name) => ({ uuid: name, name })}
      entryFromPick={(item) => item.name}
      createEntry={(name) => name}
      badgeVariant="outline"
      searchPlaceholder={tActions.plain("search")}
      className={className}
    />
  )
}
