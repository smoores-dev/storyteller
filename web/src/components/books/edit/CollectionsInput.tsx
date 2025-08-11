import { Button, Group, MultiSelect, Text } from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"
import { IconPlus } from "@tabler/icons-react"
import { Collection } from "@/database/collections"
import { usePermission } from "@/hooks/usePermission"
import { CreateCollectionModal } from "@/components/collections/CreateCollectionModal"
import { useDisclosure } from "@mantine/hooks"

interface Props {
  values: string[]
  collections: Collection[]
  getInputProps: UseFormReturnType<{ collections: string[] }>["getInputProps"]
}

export function CollectionsInput({ collections, getInputProps }: Props) {
  const hasCollectionCreate = usePermission("collectionCreate")
  const [isOpen, { open, close }] = useDisclosure()

  return (
    <>
      <CreateCollectionModal isOpen={isOpen} onClose={close} />
      <MultiSelect
        searchable
        label={
          <Group align="baseline">
            <Text>Collections</Text>
            {hasCollectionCreate && (
              <Button
                className="rounded-xl"
                leftSection={<IconPlus size={14} />}
                size="compact-xs"
                color="black"
                onClick={open}
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
