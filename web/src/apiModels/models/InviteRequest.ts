/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { UserPermissionSet } from "@/database/users"

export type InviteRequest = UserPermissionSet & {
  email: string
}
