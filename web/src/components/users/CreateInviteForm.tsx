import { EMPTY_PERMISSIONS, usePermission } from "@/contexts/UserPermissions"
import { useApiClient } from "@/hooks/useApiClient"
import { useCallback, useState, MouseEvent } from "react"
import styles from "./createinviteform.module.css"
import {
  Button,
  Select,
  SelectArrow,
  SelectItem,
  SelectItemCheck,
  SelectLabel,
  SelectPopover,
  SelectProvider,
} from "@ariakit/react"
import { UserPermissions } from "@/apiModels"

const ADMIN_PERMISSIONS: UserPermissions = {
  book_create: true,
  book_read: true,
  book_process: true,
  book_download: true,
  book_list: true,
  book_delete: true,
  book_update: true,
  invite_list: true,
  invite_delete: true,
  user_create: true,
  user_list: true,
  user_read: true,
  user_delete: true,
  settings_update: true,
}

const BASIC_PERMISSIONS: UserPermissions = {
  book_create: false,
  book_read: true,
  book_process: false,
  book_download: true,
  book_list: true,
  book_delete: false,
  book_update: false,
  invite_list: false,
  invite_delete: false,
  user_create: false,
  user_list: false,
  user_read: false,
  user_delete: false,
  settings_update: false,
}

const PERMISSION_LABELS: { [P in keyof UserPermissions]: string } = {
  book_create: "Upload new books",
  book_read: "See book info",
  book_process: "Manage book syncing",
  book_download: "Download synced books",
  book_list: "List all books",
  book_delete: "Delete books",
  book_update: "Change book info",
  invite_list: "See user invites",
  invite_delete: "Delete user invites",
  user_create: "Invite new users",
  user_list: "List all users",
  user_read: "See other users' info",
  user_delete: "Delete users",
  settings_update: "Change server settings",
}

enum State {
  CLEAN = "CLEAN",
  LOADING = "LOADING",
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

function renderValue(currentPermissions: UserPermissions) {
  return `${Object.values(currentPermissions).reduce(
    (acc, isSet) => (isSet ? acc + 1 : acc),
    0,
  )} selected`
}

function getSelected(
  currentPermissions: UserPermissions,
): Array<keyof UserPermissions> {
  return Object.entries(currentPermissions)
    .filter(([, isSet]) => isSet)
    .map(([key]) => key as keyof UserPermissions)
}

type Props = {
  onUpdate: () => void
}

export function CreateInviteForm({ onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState("")
  const [permissions, setPermissions] = useState(BASIC_PERMISSIONS)
  const [state, setState] = useState(State.CLEAN)

  const resetState = useCallback((event: MouseEvent) => {
    event.preventDefault()
    setShowForm(true)
    setEmail("")
  }, [])

  const client = useApiClient()
  const canAddUser = usePermission("user_create")

  if (!canAddUser) return null

  return (
    <div className={styles["container"]}>
      {showForm ? (
        <form className={styles["form"]}>
          <fieldset className={styles["fields"]}>
            <label>
              Email
              <input
                className={styles["input"]}
                id="email"
                name="email"
                type="email"
                onChange={(e) => {
                  setEmail(e.target.value)
                }}
                value={email}
              />
            </label>
            <div>
              <SelectProvider
                value={getSelected(permissions)}
                setValue={(selected: Array<keyof UserPermissions>) => {
                  const next = { ...EMPTY_PERMISSIONS }
                  for (const permission of selected) {
                    next[permission] = true
                  }
                  setPermissions(next)
                }}
              >
                <SelectLabel>Role</SelectLabel>
                <Button
                  className={styles["text-button"]}
                  onClick={() => {
                    setPermissions(ADMIN_PERMISSIONS)
                  }}
                >
                  Admin
                </Button>
                <Button
                  className={styles["text-button"]}
                  onClick={() => {
                    setPermissions(BASIC_PERMISSIONS)
                  }}
                >
                  Basic
                </Button>
                <Select className={styles["select-button"]}>
                  {renderValue(permissions)}
                  <SelectArrow />
                </Select>
                <SelectPopover
                  gutter={4}
                  sameWidth
                  unmountOnHide
                  className={styles["select-popover"]}
                >
                  {Object.entries(PERMISSION_LABELS).map(
                    ([permission, label]) => (
                      <SelectItem
                        key={permission}
                        value={permission}
                        className={styles["select-item"]}
                      >
                        <SelectItemCheck />
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectPopover>
              </SelectProvider>
            </div>
          </fieldset>
          {state === State.SUCCESS ? (
            <div className={styles["results"]}>
              <span>Done!</span>
              <Button
                type="reset"
                className={styles["button"]}
                onClick={resetState}
              >
                Invite another user
              </Button>
            </div>
          ) : state === State.ERROR ? (
            <div className={styles["results"]}>
              <span>Failed - check your server logs for more details</span>
              <Button
                type="reset"
                className={styles["button"]}
                onClick={resetState}
              >
                Try again
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              className={styles["submit-button"]}
              disabled={email === "" || state !== State.CLEAN}
              onClick={async (e) => {
                e.preventDefault()

                setState(State.LOADING)
                try {
                  await client.createInvite({ email, ...permissions })
                } catch (e) {
                  console.error(e)
                  setState(State.ERROR)
                  onUpdate()
                  return
                }

                setState(State.SUCCESS)
                onUpdate()
              }}
            >
              Create
            </Button>
          )}
        </form>
      ) : (
        <Button
          className={styles["add-button"]}
          onClick={() => {
            setShowForm(true)
          }}
        >
          Invite user
        </Button>
      )}
    </div>
  )
}
