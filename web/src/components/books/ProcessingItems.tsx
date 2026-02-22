import { ActionIcon, Menu, Text, Tooltip } from "@mantine/core"
import {
  IconProgress,
  IconProgressX,
  IconReload,
  IconTrash,
} from "@tabler/icons-react"

import { type BookWithRelations } from "@/database/books"
import {
  useCancelProcessingMutation,
  useDeleteBookAssetsMutation,
  useProcessBookMutation,
} from "@/store/api"

type Props = {
  book: BookWithRelations
  aligned: boolean
}

export function ProcessingItems({ book, aligned }: Props) {
  const [processBook] = useProcessBookMutation()
  const [cancelProcessing] = useCancelProcessingMutation()
  const [deleteBookAssets] = useDeleteBookAssetsMutation()

  if (
    book.readaloud?.status !== "QUEUED" &&
    book.readaloud?.status !== "PROCESSING"
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
            onClick={() => processBook({ uuid: book.uuid, restart: false })}
          >
            <IconProgress aria-hidden />{" "}
            {aligned ? "Re-sync (keep all files)" : "Continue"}
          </Menu.Item>

          <Menu.Sub openDelay={100} closeDelay={150}>
            <Menu.Sub.Target>
              <Menu.Sub.Item
                classNames={{
                  itemLabel: "flex gap-2",
                }}
              >
                <IconReload aria-hidden /> Re-process
              </Menu.Sub.Item>
            </Menu.Sub.Target>
            <Menu.Sub.Dropdown>
              <Menu.Item
                classNames={{
                  itemLabel: "flex gap-2",
                }}
                onClick={() =>
                  processBook({ uuid: book.uuid, restart: "sync" })
                }
              >
                <IconProgress aria-hidden /> From sync step (keep
                transcriptions)
              </Menu.Item>
              <Menu.Item
                classNames={{
                  itemLabel: "flex gap-2",
                }}
                onClick={() =>
                  processBook({ uuid: book.uuid, restart: "transcription" })
                }
              >
                <IconReload aria-hidden /> From transcription step (keep audio)
              </Menu.Item>
              <Menu.Item
                classNames={{
                  itemLabel: "flex gap-2",
                }}
                onClick={() =>
                  processBook({ uuid: book.uuid, restart: "full" })
                }
              >
                <IconReload aria-hidden /> Full restart (delete all cache)
              </Menu.Item>
            </Menu.Sub.Dropdown>
          </Menu.Sub>

          <Menu.Divider />

          <Menu.Item
            classNames={{
              itemLabel: "flex gap-2",
            }}
            onClick={() => deleteBookAssets({ uuid: book.uuid })}
          >
            <IconTrash aria-hidden /> Delete cache files
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
        book.readaloud.status === "QUEUED"
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
            book.readaloud.status === "QUEUED"
              ? "Remove from queue"
              : "Stop processing"
          }
        />
      </ActionIcon>
    </Tooltip>
  )
}
