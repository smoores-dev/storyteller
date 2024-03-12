/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { UserPermissions } from "./UserPermissions"

export type User = {
  uuid: string
  username: string
  email?: string | null
  full_name?: string | null
  permissions: UserPermissions
}
