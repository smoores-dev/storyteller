import { Button, Group, MultiSelect, Stack } from "@mantine/core"
import { Search } from "../books/Search"
import { Sort } from "../books/Sort"
import {
  BookType,
  createComparisonTitle,
  FilterSortOptions,
} from "@/hooks/useFilterSortedBooks"
import { UUID } from "@/uuid"
import {
  useListAuthorsQuery,
  useListCollectionsQuery,
  useListSeriesQuery,
  useListStatusesQuery,
  useListTagsQuery,
} from "@/store/api"
import { useMemo } from "react"

interface Props {
  options: FilterSortOptions
}

export function FilterSort({
  options: { onSearchChange, sort, onSortChange, filters },
}: Props) {
  const { data: collections = [] } = useListCollectionsQuery()
  const { data: tags = [] } = useListTagsQuery()
  const { data: series = [] } = useListSeriesQuery()
  const { data: authors = [] } = useListAuthorsQuery()
  const { data: statuses = [] } = useListStatusesQuery()

  const sortedTags = useMemo(
    () =>
      tags.slice().sort((a, b) => {
        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()
        if (aName < bName) return -1
        if (aName > bName) return 1
        return 0
      }),
    [tags],
  )

  const sortedSeries = useMemo(
    () =>
      series.slice().sort((a, b) => {
        const aName = createComparisonTitle(a.name, new Intl.Locale("en-US"))
        const bName = createComparisonTitle(b.name, new Intl.Locale("en-US"))
        if (aName < bName) return -1
        if (aName > bName) return 1
        return 0
      }),
    [series],
  )

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
              searchable
              label="Authors"
              placeholder="Any author"
              data={authors.map((s) => ({
                label: s.name,
                value: s.uuid,
              }))}
              value={filters.authors ?? []}
              onChange={(values) => {
                filters.onAuthorsChange(
                  !values.length ? null : (values as UUID[]),
                )
              }}
            />
            <MultiSelect
              searchable
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
              searchable
              label="Format"
              placeholder="Any format"
              data={[
                {
                  label: "Ebook",
                  value: "ebook",
                },
                {
                  label: "Ebook only",
                  value: "ebook-only",
                },
                {
                  label: "Audiobook",
                  value: "audiobook",
                },
                {
                  label: "Audiobook only",
                  value: "audiobook-only",
                },
                {
                  label: "Readaloud",
                  value: "readaloud",
                },
                {
                  label: "Missing readaloud",
                  value: "ebook-audiobook",
                },
              ]}
              value={filters.bookTypes ?? []}
              onChange={(values) => {
                filters.onBookTypesChange(
                  !values.length ? null : (values as BookType[]),
                )
              }}
            />
            <MultiSelect
              searchable
              label="Series"
              placeholder="Any series"
              data={sortedSeries.map((s) => ({
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
              label="Status"
              placeholder="Any status"
              data={statuses.map((s) => ({
                label: s.name,
                value: s.uuid,
              }))}
              value={filters.statuses ?? []}
              onChange={(values) => {
                filters.onStatusesChange(
                  !values.length ? null : (values as UUID[]),
                )
              }}
            />
            <MultiSelect
              searchable
              label="Tags"
              placeholder="Any tag"
              data={sortedTags
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
