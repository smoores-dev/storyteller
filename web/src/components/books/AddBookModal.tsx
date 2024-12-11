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

export function AddBookModal() {
  const dialogStore = useDialogStore()

  return (
    <>
      <Button className={styles["add-book-button"]} onClick={dialogStore.show}>
        + Add book
      </Button>
      <Dialog modal className={styles["add-book-modal"]} store={dialogStore}>
        <DialogHeading className={styles["add-book-modal-heading"]}>
          Add book
        </DialogHeading>
        <BookUpload
          onSubmit={() => {
            dialogStore.hide()
          }}
        />
        <div className={styles["add-book-modal-dismiss"]}>
          <DialogDismiss>Cancel</DialogDismiss>
        </div>
      </Dialog>
    </>
  )
}
