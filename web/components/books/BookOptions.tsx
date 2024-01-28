import styles from "./bookoptions.module.css"
import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import {
  Button,
  Dialog,
  DialogDismiss,
  DialogHeading,
  Menu,
  MenuButton,
  MenuItem,
  useDialogStore,
  useMenuStore,
} from "@ariakit/react"
import { MoreVerticalIcon } from "../icons/MoreVerticalIcon"
import { useRef, useState } from "react"

type Props = {
  book: BookDetail
  onUpdate: () => void
}

export function BookOptions({ book, onUpdate }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const client = useApiClient()
  const menuStore = useMenuStore()
  const dialogStore = useDialogStore()

  return (
    <>
      <MenuButton store={menuStore} className={styles["button"]}>
        <MoreVerticalIcon className={styles["icon"]} />
      </MenuButton>
      <Menu store={menuStore} gutter={8} className={styles["menu"]}>
        <MenuItem
          className={styles["menu-item"]}
          onClick={() => {
            dialogStore.setOpen(true)
          }}
        >
          Upload audio art
        </MenuItem>
        <MenuItem
          className={styles["menu-item"]}
          onClick={() =>
            client.processBook(book.id, true).then(() => onUpdate())
          }
        >
          Re-process
        </MenuItem>
      </Menu>
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
              book.id,
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
    </>
  )
}
