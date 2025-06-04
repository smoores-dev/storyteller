/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { getUserByUsernameOrEmail } from "@/database/users"

type UserModel = NonNullable<
  Awaited<ReturnType<typeof getUserByUsernameOrEmail>>
>
export type User = Omit<UserModel, "hashedPassword">
