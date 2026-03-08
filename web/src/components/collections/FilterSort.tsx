import {
  Button,
  Flex,
  Group,
  MultiSelect,
  NumberInput,
  Stack,
  Text,
  type TextInputProps,
} from "@mantine/core"
import { type Ref, useMemo } from "react"

import { Search } from "@/components/books/Search"
import { Sort } from "@/components/books/Sort"
import {
  type BookType,
  type FilterSortOptions,
  createComparisonTitle,
} from "@/hooks/useFilterSortedBooks"
import {
  useListAuthorsQuery,
  useListCollectionsQuery,
  useListSeriesQuery,
  useListStatusesQuery,
  useListTagsQuery,
} from "@/store/api"
import { type UUID } from "@/uuid"

interface Props {
  options: FilterSortOptions
  classNames?: {
    search?: TextInputProps["classNames"]
  }
  ref?: Ref<HTMLDivElement | null>
}

export function FilterSort({
  options: {
    search: initialSearch,
    onSearchChange,
    sort,
    onSortChange,
    filters,
  },
  classNames,
  ref,
}: Props) {
  const { data: collections = [] } = useListCollectionsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const { data: tags = [] } = useListTagsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const { data: series = [] } = useListSeriesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const { data: authors = [] } = useListAuthorsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const { data: statuses = [] } = useListStatusesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })

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
    <Stack ref={ref} className="gap-y-1" align="start" id="filter-sort">
      <Group className="gap-1">
        <Search
          value={initialSearch}
          onValueChange={onSearchChange}
          classNames={classNames?.search}
        />
        <Sort value={sort} onValueChange={onSortChange} />
      </Group>
      {filters.visible ? (
        <>
          <Group className="gap-1">
            <MultiSelect
              searchable
              aria-label="Collections"
              placeholder={`Collections (${collections.length})`}
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
              aria-label="Tags"
              placeholder={`Tags (${tags.length})`}
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
            <MultiSelect
              searchable
              aria-label="Authors"
              placeholder={`Authors (${authors.length})`}
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
              aria-label="Series"
              placeholder={`Series (${series.length})`}
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
              searchable
              aria-label="Format"
              placeholder={`Format`}
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
                {
                  label: "Ebook only",
                  value: "ebook-only",
                },
                {
                  label: "Audiobook only",
                  value: "audiobook-only",
                },
                {
                  label: "Missing readaloud",
                  value: "ebook-audiobook-only",
                },
                {
                  label: "Has missing files",
                  value: "missing",
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
              aria-label="Status"
              placeholder={`Status`}
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
          </Group>
          <Group className="gap-3">
            <Stack gap={2}>
              <Text className="text-xs text-gray-500">File size (MB)</Text>
              <Flex className="gap-1">
                <NumberInput
                  className="w-20"
                  aria-label="Min file-size (MB)"
                  placeholder="Min"
                  value={filters.fileSize?.[0] || ""}
                  onChange={(value) => {
                    filters.onFileSizeChange([
                      Number(value),
                      filters.fileSize?.[1] ?? 0,
                    ])
                  }}
                />
                <NumberInput
                  className="w-20"
                  aria-label="Max file-size (MB)"
                  placeholder="Max"
                  value={filters.fileSize?.[1] || ""}
                  onChange={(value) => {
                    filters.onFileSizeChange([
                      filters.fileSize?.[0] ?? 0,
                      Number(value),
                    ])
                  }}
                />
              </Flex>
            </Stack>
            <Stack gap={2}>
              <Text className="text-xs text-gray-500">Duration (min)</Text>
              <Flex className="gap-1">
                <NumberInput
                  className="w-20"
                  aria-label="Min duration (minutes)"
                  placeholder="Min"
                  value={filters.duration?.[0] || ""}
                  onChange={(value) => {
                    filters.onDurationChange([
                      Number(value),
                      filters.duration?.[1] ?? 0,
                    ])
                  }}
                />
                <NumberInput
                  className="w-20"
                  aria-label="Max duration (minutes)"
                  placeholder="Max"
                  value={filters.duration?.[1] || ""}
                  onChange={(value) => {
                    filters.onDurationChange([
                      filters.duration?.[0] ?? 0,
                      Number(value),
                    ])
                  }}
                />
              </Flex>
            </Stack>
            <Stack gap={2}>
              <Text className="text-xs text-gray-500">Pages</Text>
              <Flex className="gap-1">
                <NumberInput
                  className="w-20"
                  aria-label="Min page count"
                  placeholder="Min"
                  value={filters.pageCount?.[0] || ""}
                  onChange={(value) => {
                    filters.onPageCountChange([
                      Number(value),
                      filters.pageCount?.[1] ?? 0,
                    ])
                  }}
                />
                <NumberInput
                  className="w-20"
                  aria-label="Max page count"
                  placeholder="Max"
                  value={filters.pageCount?.[1] || ""}
                  onChange={(value) => {
                    filters.onPageCountChange([
                      filters.pageCount?.[0] ?? 0,
                      Number(value),
                    ])
                  }}
                />
              </Flex>
            </Stack>
          </Group>

          <Group>
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
