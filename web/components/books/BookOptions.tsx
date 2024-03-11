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
import { HardRestartIcon } from "../icons/HardRestartIcon"
import { SoftRestartIcon } from "../icons/SoftRestartIcon"
import { EditIcon } from "../icons/EditIcon"
import { DeleteIcon } from "../icons/DeleteIcon"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/contexts/UserPermissions"

type Props = {
  book: BookDetail
  onUpdate: () => void
}

export function BookOptions({ book, onUpdate }: Props) {
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
        {permissions.book_process && (
          <MenuItem
            className={styles["menu-item"]}
            onClick={() =>
              client.processBook(book.uuid, false).then(() => onUpdate())
            }
          >
            <TooltipProvider placement="right">
              <TooltipAnchor>
                <SoftRestartIcon ariaLabel="Re-process" />
              </TooltipAnchor>
              <Tooltip>Re-process</Tooltip>
            </TooltipProvider>
          </MenuItem>
        )}
        {permissions.book_process && (
          <MenuItem
            className={styles["menu-item"]}
            onClick={() =>
              client.processBook(book.uuid, true).then(() => onUpdate())
            }
          >
            <TooltipProvider placement="right">
              <TooltipAnchor>
                <HardRestartIcon ariaLabel="Force re-process" />
              </TooltipAnchor>
              <Tooltip>Force re-process</Tooltip>
            </TooltipProvider>
          </MenuItem>
        )}
        {permissions.book_delete && (
          <MenuItem
            className={`${styles["menu-item"]} ${styles["delete"]}`}
            onClick={() => {
              client.deleteBook(book.uuid).then(() => onUpdate())
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
