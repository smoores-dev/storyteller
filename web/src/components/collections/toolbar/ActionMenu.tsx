import { Button, Menu, MenuDropdown, MenuTarget } from "@mantine/core"
import { IconChevronDown, IconClick } from "@tabler/icons-react"

import { usePermissions } from "@/hooks/usePermissions"
import {
  useLazyListCollectionsQuery,
  useLazyListCreatorsQuery,
  useLazyListSeriesQuery,
  useLazyListTagsQuery,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { AddBooksToCollectionsItem } from "./actionMenuItems/AddBooksToCollectionsItem"
import { AddBooksToSeriesItem } from "./actionMenuItems/AddBooksToSeriesItem"
import { AddTagsToBooksItem } from "./actionMenuItems/AddTagsToBooksItem"
import { BeginProcessingItem } from "./actionMenuItems/BeginProcessingItem"
import { DeleteBooksItem } from "./actionMenuItems/DeleteBooksItem"
import { MergeBooksItem } from "./actionMenuItems/MergeBooksItem"
import { RemoveBooksFromCollectionsItem } from "./actionMenuItems/RemoveBooksFromCollectionsItem"
import { RemoveBooksFromSeriesItem } from "./actionMenuItems/RemoveBooksFromSeriesItem"
import { RemoveTagsFromBooksItem } from "./actionMenuItems/RemoveTagsFromBooksItem"
import { UpdateReadingStatusItem } from "./actionMenuItems/UpdateReadingStatusItem"

interface Props {
  selected: Set<UUID>
  onClear: () => void
}

export function ActionMenu({ selected, onClear }: Props) {
  const permissions = usePermissions()

  const [refetchCollections] = useLazyListCollectionsQuery()
  const [refetchCreators] = useLazyListCreatorsQuery()
  const [refetchSeries] = useLazyListSeriesQuery()
  const [refetchTags] = useLazyListTagsQuery()
  const disabled = selected.size === 0

  function onCommit() {
    onClear()
    void refetchCollections()
    void refetchCreators()
    void refetchSeries()
    void refetchTags()
  }

  return (
    <>
      <Menu shadow="sm" disabled={disabled} keepMounted>
        <MenuTarget>
          <Button
            variant="light"
            leftSection={<IconClick />}
            rightSection={<IconChevronDown size={16} />}
            disabled={disabled}
          >
            Actions
          </Button>
        </MenuTarget>

        <MenuDropdown>
          {!!permissions?.bookUpdate && (
            <MergeBooksItem selected={selected} onCommit={onCommit} />
          )}
          {!!permissions?.bookUpdate && (
            <AddBooksToCollectionsItem selected={selected} />
          )}
          {!!permissions?.bookUpdate && (
            <RemoveBooksFromCollectionsItem selected={selected} />
          )}
          {!!permissions?.bookUpdate && (
            <AddBooksToSeriesItem selected={selected} />
          )}
          {!!permissions?.bookUpdate && (
            <RemoveBooksFromSeriesItem selected={selected} />
          )}
          {!!permissions?.bookUpdate && (
            <AddTagsToBooksItem selected={selected} />
          )}
          {!!permissions?.bookUpdate && (
            <RemoveTagsFromBooksItem selected={selected} />
          )}
          <UpdateReadingStatusItem selected={selected} />
          {!!permissions?.bookProcess && (
            <BeginProcessingItem selected={selected} />
          )}
          {!!permissions?.bookDelete && (
            <DeleteBooksItem selected={selected} onCommit={onCommit} />
          )}
        </MenuDropdown>
      </Menu>
    </>
  )
}
