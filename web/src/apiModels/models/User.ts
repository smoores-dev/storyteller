/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { getUser } from "@/database/users"

type UserModel = NonNullable<Awaited<ReturnType<typeof getUser>>>
export type User = Omit<UserModel, "hashedPassword">
