import {
  Modal,
  TextInput,
  Checkbox,
  Textarea,
  Button,
  Text,
} from "@mantine/core"
import { UserSelect } from "../books/edit/UserSelect"
import { SaveState } from "../forms"
import { ImportPathInput } from "../ImportPathInput"
import { useForm } from "@mantine/form"
import { UUID } from "@/uuid"
import { useRef, useState } from "react"
import {
  useCreateCollectionMutation,
  useGetCurrentUserQuery,
  useLazyListCollectionsQuery,
  useListUsersQuery,
} from "@/store/api"

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function CreateCollectionModal({ isOpen, onClose }: Props) {
  const { data: users = [] } = useListUsersQuery()
  const { data: currentUser } = useGetCurrentUserQuery()

  const [createCollection] = useCreateCollectionMutation()
  const [refetchCollections] = useLazyListCollectionsQuery()

  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const form = useForm({
    initialValues: {
      name: "",
      public: true,
      users: [] as UUID[],
      description: "",
      importPath: null as null | string,
    },
  })

  const [savedState, setSavedState] = useState<SaveState>(SaveState.CLEAN)

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="Create a new collection"
      centered
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={form.onSubmit(async (values, event) => {
          event?.stopPropagation()
          setSavedState(SaveState.LOADING)
          try {
            if (
              !values.public &&
              currentUser &&
              !values.users.includes(currentUser.id)
            ) {
              values.users.push(currentUser.id)
            }

            await createCollection(values)
            await refetchCollections()
          } catch {
            setSavedState(SaveState.ERROR)
            return
          }

          setSavedState(SaveState.SAVED)

          if (clearSavedTimeoutRef.current) {
            clearTimeout(clearSavedTimeoutRef.current)
          }

          clearSavedTimeoutRef.current = setTimeout(() => {
            setSavedState(SaveState.CLEAN)
            onClose()
            form.reset()
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
          disabled={!form.values.name || savedState === SaveState.LOADING}
        >
          {savedState === SaveState.SAVED ? "Saved!" : "Create"}
        </Button>
      </form>
    </Modal>
  )
}
