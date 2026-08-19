"use server"

import { revalidatePath } from "next/cache"

import {
  assertAuthenticatedUser,
  createConfig,
  hashPassword,
} from "@/auth/auth"
import { updateUser } from "@/database/users"

export async function updateProfileAction(data: {
  username: string
  email: string
  name: string
  password?: string
}) {
  const user = await assertAuthenticatedUser()

  const hashedPassword = data.password
    ? await hashPassword(data.password)
    : undefined

  await updateUser(user.id, {
    username: data.username,
    email: data.email,
    name: data.name,
    ...(hashedPassword && { hashedPassword }),
  })

  revalidatePath("/v3/preferences")
}

export async function unlinkAccountAction(data: {
  provider: string
  providerAccountId: string
}) {
  await assertAuthenticatedUser()

  const config = await createConfig(undefined)
  await config.adapter?.unlinkAccount?.({
    provider: data.provider,
    providerAccountId: data.providerAccountId,
  })

  revalidatePath("/v3/preferences")
}
