import { Button, Group, MultiSelect, Stack } from "@mantine/core"
import { Search } from "../books/Search"
import { Sort } from "../books/Sort"
import { FilterSortOptions } from "@/hooks/useFilterSortedBooks"
import { UUID } from "@/uuid"
import {
  useListCollectionsQuery,
  useListSeriesQuery,
  useListTagsQuery,
} from "@/store/api"

interface Props {
  options: FilterSortOptions
}

export function FilterSort({
  options: { onSearchChange, sort, onSortChange, filters },
}: Props) {
  const { data: collections = [] } = useListCollectionsQuery()
  const { data: tags = [] } = useListTagsQuery()
  const { data: series = [] } = useListSeriesQuery()

  return (
    <Stack gap={0} align="start">
      <Group>
        <Search onValueChange={onSearchChange} />
        <Sort value={sort} onValueChange={onSortChange} />
      </Group>
      {filters.visible ? (
        <>
          <Group>
            <MultiSelect
              label="Collections"
              placeholder="Any collection"
              data={collections
                .map((collection) => ({
                  label: collection.name,
                  value: collection.uuid as string,
                }))
                .concat([{ label: "Uncollected", value: "none" }])}
              value={filters.collections ?? []}
              onChange={(values) => {
                filters.onCollectionsChange(
                  !values.length ? null : (values as UUID[]),
                )
              }}
            />
            <MultiSelect
              label="Tags"
              placeholder="Any tag"
              data={tags
                .map((tag) => ({
                  label: tag.name,
                  value: tag.uuid as string,
                }))
                .concat([{ label: "Untagged", value: "none" }])}
              value={filters.tags ?? []}
              onChange={(values) => {
                filters.onTagsChange(!values.length ? null : (values as UUID[]))
              }}
            />
            <MultiSelect
              label="Series"
              placeholder="Any series"
              data={series.map((s) => ({
                label: s.name,
                value: s.uuid,
              }))}
              value={filters.series ?? []}
              onChange={(values) => {
                filters.onSeriesChange(
                  !values.length ? null : (values as UUID[]),
                )
              }}
            />
            <MultiSelect
              label="Book type"
              placeholder="Any type"
              data={[
                {
                  label: "Ebook",
                  value: "ebook",
                },
                {
                  label: "Audiobook",
                  value: "audiobook",
                },
                {
                  label: "Readaloud",
                  value: "readaloud",
                },
              ]}
              value={filters.bookTypes ?? []}
              onChange={(values) => {
                filters.onBookTypesChange(
                  !values.length
                    ? null
                    : (values as ("ebook" | "audiobook" | "readaloud")[]),
                )
              }}
            />
          </Group>
          <Group className="mt-4">
            <Button
              size="compact-sm"
              variant="subtle"
              onClick={() => {
                filters.reset()
              }}
            >
              Reset
            </Button>
            <Button
              size="compact-sm"
              variant="subtle"
              onClick={() => {
                filters.reset()
                filters.hideFilters()
              }}
            >
              Collapse advanced
            </Button>
          </Group>
        </>
      ) : (
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={() => {
            filters.showFilters()
          }}
        >
          Advanced
        </Button>
      )}
    </Stack>
  )
}
