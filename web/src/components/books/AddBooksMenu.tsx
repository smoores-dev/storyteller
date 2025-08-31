import { Collection } from "@/database/collections"
import { Button, ButtonVariant, Menu } from "@mantine/core"
import {
  IconBooks,
  IconBookUpload,
  IconCirclePlus,
  IconFileImport,
} from "@tabler/icons-react"
import { AddBooksModal } from "./modals/AddBooksModal"
import { useState } from "react"
import { UploadBooksModal } from "./modals/UploadBooksModal"
import { ImportServerBooksModal } from "./modals/ImportServerBooksModal"

interface Props {
  className?: string
  variant?: ButtonVariant
  collection?: Collection | undefined
}

export function AddBooksMenu({ className, variant, collection }: Props) {
  const [isAddBooksModalOpen, setIsAddBooksModalOpen] = useState(false)
  const [isUploadBooksModalOpen, setIsUploadBooksModalOpen] = useState(false)
  const [isImportBooksModalOpen, setIsImportBooksModalOpen] = useState(false)

  return (
    <>
      {collection && (
        <AddBooksModal
          isOpen={isAddBooksModalOpen}
          onClose={() => {
            setIsAddBooksModalOpen(false)
          }}
          collection={collection}
        />
      )}
      <UploadBooksModal
        isOpen={isUploadBooksModalOpen}
        onClose={() => {
          setIsUploadBooksModalOpen(false)
        }}
        collection={collection}
      />
      <ImportServerBooksModal
        isOpen={isImportBooksModalOpen}
        onClose={() => {
          setIsImportBooksModalOpen(false)
        }}
        collection={collection}
      />
      <Menu shadow="sm">
        <Menu.Target>
          <Button
            variant={variant ?? "light"}
            {...(className && { className })}
            leftSection={<IconCirclePlus />}
          >
            Add books
          </Button>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconBookUpload />}
            onClick={() => {
              setIsUploadBooksModalOpen(true)
            }}
          >
            Upload books
          </Menu.Item>
          <Menu.Item
            leftSection={<IconFileImport />}
            onClick={() => {
              setIsImportBooksModalOpen(true)
            }}
          >
            Import books from server
          </Menu.Item>
          {collection && (
            <Menu.Item
              leftSection={<IconBooks />}
              onClick={() => {
                setIsAddBooksModalOpen(true)
              }}
            >
              Add from library
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </>
  )
}
