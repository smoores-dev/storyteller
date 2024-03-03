import styles from "./bookoptions.module.css"
import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import {
  Button,
  Dialog,
  DialogDismiss,
  DialogHeading,
  MenuItem,
  MenuProvider,
  Menubar,
  Tooltip,
  TooltipAnchor,
  TooltipProvider,
  useDialogStore,
} from "@ariakit/react"
import { useRef, useState } from "react"
import { HardRestartIcon } from "../icons/HardRestartIcon"
import { SoftRestartIcon } from "../icons/SoftRestartIcon"
import { EditIcon } from "../icons/EditIcon"
import { DeleteIcon } from "../icons/DeleteIcon"

type Props = {
  book: BookDetail
  onUpdate: () => void
}

export function BookOptions({ book, onUpdate }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const client = useApiClient()
  const dialogStore = useDialogStore()

  return (
    <Menubar className={styles["menu"]}>
      <MenuProvider>
        <MenuItem
          className={styles["menu-item"]}
          onClick={() => {
            dialogStore.setOpen(true)
          }}
        >
          <TooltipProvider placement="right">
            <TooltipAnchor>
              <EditIcon ariaLabel="Edit" />
            </TooltipAnchor>
            <Tooltip>Edit</Tooltip>
          </TooltipProvider>
        </MenuItem>
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
      </MenuProvider>
      <Dialog store={dialogStore} className={styles["modal"]}>
        <DialogHeading className={styles["modal-heading"]}>
          Upload audio art
        </DialogHeading>
        <form
          id="audio-art-upload"
          onSubmit={(event) => {
            event.preventDefault()
            if (!inputRef.current?.files?.[0]) return

            client.uploadBookCover(
              book.uuid,
              inputRef.current.files[0],
              ({ progress }) => {
                setUploadProgress(progress ?? null)
              },
            )
          }}
        >
          <div>
            <input
              id="audio-art-file"
              name="audio-art-file"
              ref={inputRef}
              type="file"
            />
          </div>
          <Button type="submit">Upload</Button>
        </form>
        <div>
          {uploadProgress !== null && (
            <p>Uploading... {Math.floor(uploadProgress * 100)}%</p>
          )}
        </div>
        <div className={styles["modal-dismiss"]}>
          <DialogDismiss>Done</DialogDismiss>
        </div>
      </Dialog>
    </Menubar>
  )
}
