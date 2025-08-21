import { UUID } from "@/uuid"
import { Menu, MenuTarget, Button, MenuDropdown } from "@mantine/core"
import { IconCheckbox, IconChevronDown } from "@tabler/icons-react"
import { AddBooksToCollectionsItem } from "./actionMenuItems/AddBooksToCollectionsItem"
import { RemoveBooksFromCollectionsItem } from "./actionMenuItems/RemoveBooksFromCollectionsItem"
import { AddBooksToSeriesItem } from "./actionMenuItems/AddBooksToSeriesItem"
import { RemoveBooksFromSeriesItem } from "./actionMenuItems/RemoveBooksFromSeriesItem"
import { MergeBooksItem } from "./actionMenuItems/MergeBooksItem"
import { DeleteBooksItem } from "./actionMenuItems/DeleteBooksItem"
import { AddTagsToBooksItem } from "./actionMenuItems/AddTagsToBooksItem"
import { RemoveTagsFromBooksItem } from "./actionMenuItems/RemoveTagsFromBooksItem"
import { UpdateReadingStatusItem } from "./actionMenuItems/UpdateReadingStatusItem"
import { BeginProcessingItem } from "./actionMenuItems/BeginProcessingItem"
import {
  useLazyListCollectionsQuery,
  useLazyListCreatorsQuery,
  useLazyListSeriesQuery,
  useLazyListTagsQuery,
} from "@/store/api"

interface Props {
  selected: Set<UUID>
  onClear: () => void
}

export function ActionMenu({ selected, onClear }: Props) {
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
            leftSection={<IconCheckbox />}
            rightSection={<IconChevronDown size={16} />}
            disabled={disabled}
          >
            Actions
          </Button>
        </MenuTarget>

        <MenuDropdown>
          <MergeBooksItem selected={selected} onCommit={onCommit} />
          <AddBooksToCollectionsItem selected={selected} />
          <RemoveBooksFromCollectionsItem selected={selected} />
          <AddBooksToSeriesItem selected={selected} />
          <RemoveBooksFromSeriesItem selected={selected} />
          <AddTagsToBooksItem selected={selected} />
          <RemoveTagsFromBooksItem selected={selected} />
          <UpdateReadingStatusItem selected={selected} />
          <BeginProcessingItem selected={selected} />
          <DeleteBooksItem selected={selected} onCommit={onCommit} />
        </MenuDropdown>
      </Menu>
    </>
  )
}
