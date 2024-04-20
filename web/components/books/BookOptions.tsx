import styles from "./bookoptions.module.css"
import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import {
  MenuItem,
  MenuProvider,
  Menubar,
  Tooltip,
  TooltipAnchor,
  TooltipProvider,
} from "@ariakit/react"
import cx from "classnames"
import { EditIcon } from "../icons/EditIcon"
import { DeleteIcon } from "../icons/DeleteIcon"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/contexts/UserPermissions"
import { ProcessingItems } from "./ProcessingItems"

type Props = {
  book: BookDetail
}

export function BookOptions({ book }: Props) {
  const client = useApiClient()
  const router = useRouter()

  const permissions = usePermissions()

  return (
    <Menubar className={styles["menu"]}>
      <MenuProvider>
        {permissions.book_update && (
          <MenuItem
            className={styles["menu-item"]}
            onClick={() => {
              router.push(`/books/${book.uuid}`)
            }}
          >
            <TooltipProvider placement="right">
              <TooltipAnchor>
                <EditIcon ariaLabel="Edit" />
              </TooltipAnchor>
              <Tooltip>Edit</Tooltip>
            </TooltipProvider>
          </MenuItem>
        )}
        {permissions.book_process && <ProcessingItems book={book} />}
        {permissions.book_delete && (
          <MenuItem
            className={cx(styles["menu-item"], styles["delete"])}
            onClick={() => {
              void client.deleteBook(book.uuid)
            }}
          >
            <TooltipProvider placement="right">
              <TooltipAnchor>
                <DeleteIcon ariaLabel="Delete" />
              </TooltipAnchor>
              <Tooltip>Delete</Tooltip>
            </TooltipProvider>
          </MenuItem>
        )}
      </MenuProvider>
    </Menubar>
  )
}
