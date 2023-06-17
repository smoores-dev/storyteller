"use client"

import {
  Button,
  Dialog,
  DialogDismiss,
  DialogHeading,
  useDialogStore,
} from "@ariakit/react"

import BookUpload from "./BookUpload"
import styles from "./books.module.css"

type Props = {
  apiHost: string
}

export function AddBookModal({ apiHost }: Props) {
  const dialogStore = useDialogStore()
  return (
    <>
      <Button onClick={dialogStore.show}>+ Add book</Button>
      <Dialog modal className={styles["add-book-modal"]} store={dialogStore}>
        <DialogHeading className={styles["add-book-modal-heading"]}>
          Add book
        </DialogHeading>
        <BookUpload apiHost={apiHost} />
        <div className={styles["add-book-modal-dismiss"]}>
          <DialogDismiss>Cancel</DialogDismiss>
        </div>
      </Dialog>
    </>
  )
}
