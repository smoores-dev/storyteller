import { nextAuth } from "@/auth/auth"

export const dynamic = "force-dynamic"

/**
 * @summary Log out
 * @desc '
 */
export const POST = async () => {
  await nextAuth.signOut({ redirectTo: "/login" })
}
