"use client"
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
  useModalsStack,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconSettings } from "@tabler/icons-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { ImportPathInput } from "@/components/ImportPathInput"
import { UserSelect } from "@/components/books/edit/UserSelect"
import {
  useDeleteCollectionMutation,
  useListCollectionsQuery,
  useListUsersQuery,
  useUpdateCollectionMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

interface Props {
  uuid: UUID
}

export function CollectionSettings({ uuid }: Props) {
  const { collection } = useListCollectionsQuery(undefined, {
    selectFromResult: (result) => ({
      collection: result.data?.find((collection) => collection.uuid === uuid),
    }),
  })
  const stack = useModalsStack(["delete", "update"])
  const { data: users = [] } = useListUsersQuery()

  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [updateCollection, { isLoading, isSuccess, reset }] =
    useUpdateCollectionMutation()
  const [deleteCollection] = useDeleteCollectionMutation()

  const form = useForm({
    initialValues: {
      name: collection?.name ?? "",
      public: collection?.public ?? true,
      users: collection?.users.map((user) => user.id) ?? [],
      description: collection?.description ?? null,
      importPath: collection?.importPath ?? null,
    },
  })

  useEffect(() => {
    if (!collection) return

    form.setValues({
      name: collection.name,
      public: collection.public,
      users: collection.users.map((user) => user.id),
      description: collection.description,
      importPath: collection.importPath,
    })
  }, [collection]) // eslint-disable-line react-hooks/exhaustive-deps

  const router = useRouter()

  if (!collection) return null

  return (
    <>
      <Modal.Stack>
        <Modal
          {...stack.register("delete")}
          title="Deleting collection"
          centered
          size="sm"
        >
          <Stack>
            <Text>
              Are you sure you want to delete the collection{" "}
              <strong>{collection.name}</strong>?
            </Text>
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault()
                await deleteCollection({
                  uuid: collection.uuid,
                })
                router.push("/")
              }}
            >
              <Group justify="space-between">
                <Button
                  variant="subtle"
                  onClick={() => {
                    stack.close("delete")
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" color="red">
                  Delete
                </Button>
              </Group>
            </form>
          </Stack>
        </Modal>
        <Modal {...stack.register("update")} title="Update collection" centered>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.onSubmit(async (values, event) => {
              event?.stopPropagation()
              await updateCollection({ uuid: collection.uuid, update: values })

              if (clearSavedTimeoutRef.current) {
                clearTimeout(clearSavedTimeoutRef.current)
              }

              clearSavedTimeoutRef.current = setTimeout(() => {
                form.reset()
                reset()
                stack.closeAll()
              }, 1000)
            })}
          >
            <TextInput
              label="Name"
              required
              withAsterisk
              {...form.getInputProps("name")}
            />
            <Checkbox
              label="Public"
              description="Whether this collection (and its books) should be visible to all users"
              {...form.getInputProps("public", { type: "checkbox" })}
            />
            <ImportPathInput {...form.getInputProps("importPath")}>
              <Text className="text-sm text-black opacity-70">
                Storyteller can be configured to automatically import book files
                from a specific directory.
              </Text>
              <Text className="text-sm text-black opacity-70">
                When enabled, Storyteller will set up a filesystem watcher for
                the directory. When any files are added or modified within the
                directory, Storyteller will scan for new book files, and
                automatically import any that it finds. They will be added to
                this collection.
              </Text>
            </ImportPathInput>
            {!form.values.public && (
              <UserSelect
                label="Share with"
                description="This is a private collection. It will only be visible to users selected here. Books in this collection will only be visible to these users, unless they are also in a public collection."
                users={users}
                {...form.getInputProps("users")}
              />
            )}
            <Textarea
              label="Description"
              variant="filled"
              {...form.getInputProps("description")}
              value={form.values.description ?? ""}
            />
            <Group className="justify-between">
              <Button
                onClick={() => {
                  stack.open("delete")
                }}
                color="red"
                variant="outline"
              >
                Delete
              </Button>
              <Button
                className="self-end"
                type="submit"
                disabled={!form.values.name || isLoading}
              >
                {isSuccess ? "Saved!" : "Update"}
              </Button>
            </Group>
          </form>
        </Modal>
      </Modal.Stack>
      <ActionIcon
        variant="subtle"
        onClick={() => {
          stack.open("update")
        }}
      >
        <IconSettings />
      </ActionIcon>
    </>
  )
}
