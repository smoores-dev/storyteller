import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import { ActionIcon, Menu, Text, Tooltip } from "@mantine/core"
import {
  IconProgress,
  IconProgressX,
  IconReload,
  IconTrash,
} from "@tabler/icons-react"

type Props = {
  book: BookDetail
  synchronized: boolean
}

export function ProcessingItems({ book, synchronized }: Props) {
  const client = useApiClient()

  if (
    !book.processing_status?.is_processing &&
    !book.processing_status?.is_queued
  ) {
    return (
      <Menu position="left-start">
        <Menu.Target>
          <ActionIcon color="black" variant="subtle">
            <Tooltip position="right" label="Processing">
              <IconProgress aria-label="Processing" />
            </Tooltip>
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            classNames={{
              itemLabel: "flex gap-2",
            }}
            onClick={() => client.processBook(book.uuid, false)}
          >
            <IconProgress aria-hidden />{" "}
            {synchronized ? "Re-process (using cached files)" : "Continue"}
          </Menu.Item>
          <Menu.Item
            classNames={{
              itemLabel: "flex gap-2",
            }}
            onClick={() => client.processBook(book.uuid, true)}
          >
            <IconReload aria-hidden /> Delete cache and re-process from source
            files
          </Menu.Item>
          <Menu.Item
            classNames={{
              itemLabel: "flex gap-2",
            }}
            onClick={() => client.deleteBookAssets(book.uuid)}
          >
            <IconReload aria-hidden /> Delete cache files
          </Menu.Item>
          {synchronized ? (
            <Menu.Item
              classNames={{
                itemLabel: "flex gap-2",
              }}
              onClick={() => client.deleteBookAssets(book.uuid, true)}
            >
              <IconTrash color="red" aria-hidden /> Delete source and cache
              files
            </Menu.Item>
          ) : (
            <Tooltip label="You can't delete source files until the book has been synced successfully">
              <Text
                size="sm"
                display="flex"
                className="gap-2"
                opacity={0.5}
                py="xs"
                px="sm"
              >
                <IconTrash color="red" aria-hidden /> Delete source and cache
                files
              </Text>
            </Tooltip>
          )}
        </Menu.Dropdown>
      </Menu>
    )
  }

  return (
    <Tooltip
      position="right"
      label={
        book.processing_status.is_queued
          ? "Remove from queue"
          : "Stop processing"
      }
    >
      <ActionIcon
        color="red"
        variant="subtle"
        onClick={() => client.cancelProcessing(book.uuid)}
      >
        <IconProgressX
          aria-label={
            book.processing_status.is_queued
              ? "Remove from queue"
              : "Stop processing"
          }
        />
      </ActionIcon>
    </Tooltip>
  )
}
