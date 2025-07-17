import {
  Button,
  Checkbox,
  Modal,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { UserSelect } from "../books/edit/UserSelect"
import { useRef } from "react"
import { useListUsersQuery, useUpdateCollectionMutation } from "@/store/api"
import { ImportPathInput } from "../ImportPathInput"
import { CollectionWithRelations } from "@/database/collections"

interface Props {
  collection: CollectionWithRelations
  isOpen: boolean
  onClose: () => void
}

export function UpdateCollectionModal({ collection, isOpen, onClose }: Props) {
  const { data: users = [] } = useListUsersQuery()

  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [updateCollection, { isLoading, isSuccess, reset }] =
    useUpdateCollectionMutation()

  const form = useForm({
    initialValues: {
      name: collection.name,
      public: collection.public,
      users: collection.users.map((user) => user.id),
      description: collection.description,
      importPath: collection.importPath,
    },
  })

  return (
    <Modal opened={isOpen} onClose={onClose} title="Update collection" centered>
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
            onClose()
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
            When enabled, Storyteller will set up a filesystem watcher for the
            directory. When any files are added or modified within the
            directory, Storyteller will scan for new book files, and
            automatically import any that it finds. They will be added to this
            collection.
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
        />
        <Button
          className="self-end"
          type="submit"
          disabled={!form.values.name || isLoading}
        >
          {isSuccess ? "Saved!" : "Update"}
        </Button>
      </form>
    </Modal>
  )
}
