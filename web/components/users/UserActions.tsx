"use client"

import cx from "classnames"
import { User } from "@/apiModels"
import { usePermissions } from "@/contexts/UserPermissions"
import { useApiClient } from "@/hooks/useApiClient"
import {
  MenuItem,
  MenuProvider,
  Menubar,
  Tooltip,
  TooltipAnchor,
  TooltipProvider,
} from "@ariakit/react"
import styles from "./useractions.module.css"
import { DeleteIcon } from "../icons/DeleteIcon"

type Props = {
  user: User
  // onEdit: () => void
  onUpdate: () => void
}

export function UserActions({ user, onUpdate }: Props) {
  const client = useApiClient()

  const permissions = usePermissions()

  return (
    <Menubar className={styles["menu"]}>
      <MenuProvider>
        {/* <MenuItem className={styles["menu-item"]} onClick={onEdit}>
          <TooltipProvider placement="right">
            <TooltipAnchor>
              <EditIcon ariaLabel="Edit" />
            </TooltipAnchor>
            <Tooltip>Edit</Tooltip>
          </TooltipProvider>
        </MenuItem> */}
        {permissions.user_delete && (
          <MenuItem
            className={cx(styles["menu-item"], styles["delete"])}
            onClick={async () => {
              await client.deleteUser(user.uuid)
              onUpdate()
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
