import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getSettings } from "@/database/settings"
import { deleteAccounts, getAccounts } from "@/database/users"

export const dynamic = "force-dynamic"

type Params = Promise<{
  provider: string
}>

/**
 * @summary Unlink a sign-in provider from the current user
 * @desc Refuses to remove the last way the user can sign in.
 */
export const DELETE = withHasPermission<Params>("manageSelf", {
  sessionOnly: true,
})(async (request, context) => {
  const { provider } = await context.params
  if (provider === "credentials") {
    return NextResponse.json(
      { error: "Passwords can't be unlinked" },
      { status: 400 },
    )
  }

  const user = request.auth.user
  const [accounts, settings] = await Promise.all([
    getAccounts(user.id),
    getSettings(),
  ])

  if (!accounts.some((account) => account.provider === provider)) {
    return new Response(null, { status: 404 })
  }

  const canStillSignIn = accounts.some(
    (account) =>
      account.provider !== provider &&
      (account.provider !== "credentials" || !settings.disablePasswordLogin),
  )
  if (!canStillSignIn) {
    return NextResponse.json(
      { error: "This is your only way to sign in" },
      { status: 409 },
    )
  }

  await deleteAccounts(user.id, provider)

  return new Response(null, { status: 204 })
})
