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
import { BookDetail } from "@/apiModels"

type Props = {
  onSubmit: (book: BookDetail) => void
}

export function AddBookModal({ onSubmit }: Props) {
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
          onSubmit={(book) => {
            dialogStore.hide()
            onSubmit(book)
          }}
        />
        <div className={styles["add-book-modal-dismiss"]}>
          <DialogDismiss>Cancel</DialogDismiss>
        </div>
      </Dialog>
    </>
  )
}
