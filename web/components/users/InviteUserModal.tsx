"use client"

import {
  Button,
  Dialog,
  DialogDismiss,
  DialogHeading,
  useDialogStore,
} from "@ariakit/react"

import styles from "./inviteusermodal.module.css"
import { useApiClient } from "@/hooks/useApiClient"
import { useState } from "react"
import { useRouter } from "next/navigation"

export function InviteUserModal() {
  const [email, setEmail] = useState("")
  const [bookCreate, setBookCreate] = useState(false)
  const [bookRead, setBookRead] = useState(true)
  const [bookProcess, setBookProcess] = useState(false)
  const [bookDownload, setBookDownload] = useState(true)
  const [bookList, setBookList] = useState(true)
  const [userCreate, setUserCreate] = useState(false)
  const [userList, setUserList] = useState(false)
  const [userRead, setUserRead] = useState(false)
  const [userDelete, setUserDelete] = useState(false)
  const [settingsUpdate, setSettingsUpdate] = useState(false)

  const router = useRouter()

  const client = useApiClient()
  const dialogStore = useDialogStore()

  return (
    <>
      <Button
        className={styles["invite-user-button"]}
        onClick={dialogStore.show}
      >
        + Invite a new user
      </Button>
      <Dialog modal className={styles["invite-user-modal"]} store={dialogStore}>
        <DialogHeading className={styles["invite-user-modal-heading"]}>
          Invite a new user
        </DialogHeading>
        <form
          className={styles["invite-user-form"]}
          onSubmit={async (event) => {
            event.preventDefault()

            await client.createInvite({
              email,
              book_create: bookCreate,
              book_read: bookRead,
              book_process: bookProcess,
              book_download: bookDownload,
              book_list: bookList,
              user_create: userCreate,
              user_list: userList,
              user_read: userRead,
              user_delete: userDelete,
              settings_update: settingsUpdate,
            })

            router.refresh()
          }}
        >
          <label id="email-label" htmlFor="email">
            Email address
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
              }}
              required
            />
          </label>
          <div>
            <button
              type="button"
              onClick={() => {
                setBookCreate(false)
                setBookRead(true)
                setBookProcess(false)
                setBookDownload(true)
                setBookList(true)
                setUserCreate(false)
                setUserList(false)
                setUserRead(false)
                setUserDelete(false)
                setSettingsUpdate(false)
              }}
            >
              Basic user
            </button>
            <button
              type="button"
              onClick={() => {
                setBookCreate(true)
                setBookRead(true)
                setBookProcess(true)
                setBookDownload(true)
                setBookList(true)
                setUserCreate(true)
                setUserList(true)
                setUserRead(true)
                setUserDelete(true)
                setSettingsUpdate(true)
              }}
            >
              Administrator
            </button>
          </div>
          <fieldset>
            <legend>Permissions</legend>
            <label id="book-create-label" htmlFor="book-create">
              <input
                id="book-create"
                name="book-create"
                type="checkbox"
                checked={bookCreate}
                onChange={(event) => {
                  setBookCreate(event.target.checked)
                }}
              />
              Create new books
            </label>
            <label id="book-read-label" htmlFor="book-read">
              <input
                id="book-read"
                name="book-read"
                type="checkbox"
                checked={bookRead}
                onChange={(event) => {
                  setBookRead(event.target.checked)
                }}
              />
              Read book metadata
            </label>
            <label id="book-process-label" htmlFor="book-process">
              <input
                id="book-process"
                name="book-process"
                type="checkbox"
                checked={bookProcess}
                onChange={(event) => {
                  setBookProcess(event.target.checked)
                }}
              />
              Manage synchronizing books
            </label>
            <label id="book-download-label" htmlFor="book-download">
              <input
                id="book-download"
                name="book-download"
                type="checkbox"
                checked={bookDownload}
                onChange={(event) => {
                  setBookDownload(event.target.checked)
                }}
              />
              Download book files
            </label>
            <label id="book-list-label" htmlFor="book-list">
              <input
                id="book-list"
                name="book-list"
                type="checkbox"
                checked={bookList}
                onChange={(event) => {
                  setBookList(event.target.checked)
                }}
              />
              List all books
            </label>
            <label id="user-create-label" htmlFor="user-create">
              <input
                id="user-create"
                name="user-create"
                type="checkbox"
                checked={userCreate}
                onChange={(event) => {
                  setUserCreate(event.target.checked)
                }}
              />
              Create new users
            </label>
            <label id="user-list-label" htmlFor="user-list">
              <input
                id="user-list"
                name="user-list"
                type="checkbox"
                checked={userList}
                onChange={(event) => {
                  setUserList(event.target.checked)
                }}
              />
              List all users
            </label>
            <label id="user-read-label" htmlFor="user-read">
              <input
                id="user-read"
                name="user-read"
                type="checkbox"
                checked={userRead}
                onChange={(event) => {
                  setUserRead(event.target.checked)
                }}
              />
              See user data
            </label>
            <label id="user-delete-label" htmlFor="user-delete">
              <input
                id="user-delete"
                name="user-delete"
                type="checkbox"
                checked={userDelete}
                onChange={(event) => {
                  setUserDelete(event.target.checked)
                }}
              />
              Delete users
            </label>
            <label id="settings-update-label" htmlFor="settings-update">
              <input
                id="settings-update"
                name="settings-update"
                type="checkbox"
                checked={settingsUpdate}
                onChange={(event) => {
                  setSettingsUpdate(event.target.checked)
                }}
              />
              Manage library settings
            </label>
          </fieldset>
        </form>
        <div className={styles["invite-user-modal-dismiss"]}>
          <Button type="submit">Invite</Button>
          <DialogDismiss>Cancel</DialogDismiss>
        </div>
      </Dialog>
    </>
  )
}
