"use client"

import cx from "classnames"
import { Invite } from "@/apiModels"
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
  invite: Invite
  onUpdate: () => void
}

export function InviteActions({ invite, onUpdate }: Props) {
  const client = useApiClient()

  const permissions = usePermissions()

  return (
    <Menubar className={styles["menu"]}>
      <MenuProvider>
        {/* {permissions.user_create && (
          <MenuItem className={styles["menu-item"]}>
            <TooltipProvider placement="right">
              <TooltipAnchor>
                <HardRestartIcon ariaLabel="Re-send" />
              </TooltipAnchor>
              <Tooltip>Re-send</Tooltip>
            </TooltipProvider>
          </MenuItem>
        )} */}
        {permissions.invite_delete && (
          <MenuItem
            className={cx(styles["menu-item"], styles["delete"])}
            onClick={async () => {
              await client.deleteInvite(invite.key)
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
