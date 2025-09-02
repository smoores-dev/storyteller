import { Button, Group, MultiSelect, Text } from "@mantine/core"
import { type UseFormReturnType } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { IconPlus } from "@tabler/icons-react"

import { CreateCollectionModal } from "@/components/collections/CreateCollectionModal"
import { type Collection } from "@/database/collections"
import { usePermission } from "@/hooks/usePermission"

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
