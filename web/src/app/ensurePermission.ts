import { getCurrentUser } from "@/authedApiClient"
import { Permission } from "@/database/users"
import { redirect } from "next/navigation"

export async function ensurePermission(
  ...permissions: [Permission | "and" | "or", ...Permission[]]
) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect("/login")
  }

  const [first, ...rest] = permissions

  if (first === "and") {
    if (!rest.every((permission) => currentUser.permissions?.[permission])) {
      redirect("/")
    }
    return
  }

  if (first === "or") {
    if (!rest.some((permission) => currentUser.permissions?.[permission])) {
      redirect("/")
    }
    return
  }

  // Assume "and"
  if (
    ![first, ...rest].every(
      (permission) => currentUser.permissions?.[permission],
    )
  ) {
    redirect("/")
  }
}
