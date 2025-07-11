import { BookDetail } from "@/apiModels"
import {
  useCancelProcessingMutation,
  useDeleteBookAssetsMutation,
  useProcessBookMutation,
} from "@/store/api"
import { ActionIcon, Menu, Text, Tooltip } from "@mantine/core"
import {
  IconProgress,
  IconProgressX,
  IconReload,
  IconTrash,
} from "@tabler/icons-react"

type Props = {
  book: BookDetail
  aligned: boolean
}

export function ProcessingItems({ book, aligned }: Props) {
  const [processBook] = useProcessBookMutation()
  const [cancelProcessing] = useCancelProcessingMutation()
  const [deleteBookAssets] = useDeleteBookAssetsMutation()

  if (book.processingStatus === null) {
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
            onClick={() => processBook({ uuid: book.uuid, restart: false })}
          >
            <IconProgress aria-hidden />{" "}
            {aligned ? "Re-process (using cached files)" : "Continue"}
          </Menu.Item>
          <Menu.Item
            classNames={{
              itemLabel: "flex gap-2",
            }}
            onClick={() => processBook({ uuid: book.uuid, restart: true })}
          >
            <IconReload aria-hidden /> Delete cache and re-process from source
            files
          </Menu.Item>
          <Menu.Item
            classNames={{
              itemLabel: "flex gap-2",
            }}
            onClick={() => deleteBookAssets({ uuid: book.uuid })}
          >
            <IconReload aria-hidden /> Delete cache files
          </Menu.Item>
          {aligned ? (
            <Menu.Item
              classNames={{
                itemLabel: "flex gap-2",
              }}
              onClick={() =>
                deleteBookAssets({ uuid: book.uuid, originals: true })
              }
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
        book.processingStatus === "queued"
          ? "Remove from queue"
          : "Stop processing"
      }
    >
      <ActionIcon
        color="red"
        variant="subtle"
        onClick={() => cancelProcessing({ uuid: book.uuid })}
      >
        <IconProgressX
          aria-label={
            book.processingStatus === "queued"
              ? "Remove from queue"
              : "Stop processing"
          }
        />
      </ActionIcon>
    </Tooltip>
  )
}
