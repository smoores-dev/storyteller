import { usePermission } from "@/contexts/UserPermissions"
import {
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core"
import { useForm, UseFormReturnType } from "@mantine/form"
import { IconPlus } from "@tabler/icons-react"
import { useRef, useState } from "react"
import { UserSelect } from "./UserSelect"
import { User } from "@/apiModels"
import { Collection } from "@/database/collections"
import { SaveState } from "@/components/forms"
import { UUID } from "@/uuid"

interface Props {
  values: string[]
  collections: Collection[]
  onCollectionAdd: (collection: {
    name: string
    description: string
    public: boolean
    users: string[]
  }) => void | Promise<void>
  getInputProps: UseFormReturnType<{ collections: string[] }>["getInputProps"]
  users: User[]
}

export function CollectionsInput({
  collections,
  users,
  onCollectionAdd,
  getInputProps,
}: Props) {
  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasCollectionCreate = usePermission("collectionCreate")
  const [opened, setOpened] = useState(false)

  const form = useForm({
    initialValues: {
      name: "",
      public: true,
      users: [] as UUID[],
      description: "",
    },
  })

  const [savedState, setSavedState] = useState<SaveState>(SaveState.CLEAN)

  return (
    <>
      <Modal
        opened={opened}
        onClose={() => {
          setOpened(false)
        }}
        title="Create a new collection"
        centered
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.onSubmit(async (values, event) => {
            event?.stopPropagation()
            setSavedState(SaveState.LOADING)
            try {
              await onCollectionAdd(values)
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
              setOpened(false)
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
      <MultiSelect
        label={
          <Group align="baseline">
            <Text>Collections</Text>
            {hasCollectionCreate && (
              <Button
                className="rounded-xl"
                leftSection={<IconPlus size={14} />}
                size="compact-xs"
                color="black"
                onClick={() => {
                  setOpened(true)
                }}
              >
                Create new
              </Button>
            )}
          </Group>
        }
        aria-label="Collections"
        placeholder="Add to collection"
        data={collections.map((collection) => ({
          label: collection.name,
          value: collection.uuid,
        }))}
        {...getInputProps("collections")}
      />
    </>
  )
}
